import {
  loadAppConfig,
  loadDatabaseUrl,
  sessionMaxAgeMs,
} from './app-config.js';

const databaseUrl = 'postgres://postgres:postgres@127.0.0.1:55440/adonis_nest';
const sessionSecret = 'test-only-session-secret-32b-min';

describe('application configuration', () => {
  it('loads a development configuration', async () => {
    const config = await loadAppConfig({
      NODE_ENV: 'development',
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
    });

    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl,
      trustProxy: false,
      session: {
        secret: sessionSecret,
        cookieName: 'sid',
        maxAgeMs: sessionMaxAgeMs,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          maxAge: sessionMaxAgeMs,
          path: '/',
        },
      },
    });
  });

  it('loads a production configuration with one proxy hop and a secure cookie', async () => {
    const config = await loadAppConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
    });

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(8080);
    expect(config.trustProxy).toBe(1);
    expect(config.session.cookie.secure).toBe(true);
  });

  it('lets TRUST_PROXY override the production hop without enabling unrestricted trust', async () => {
    const disabled = await loadAppConfig({
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
      TRUST_PROXY: 'false',
    });
    expect(disabled.trustProxy).toBe(false);
    expect(disabled.session.cookie.secure).toBe(true);

    const optedIn = await loadAppConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
      TRUST_PROXY: '1',
    });
    expect(optedIn.trustProxy).toBe(1);
    expect(optedIn.session.cookie.secure).toBe(false);

    await expect(
      loadAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
        TRUST_PROXY: 'true',
      }),
    ).rejects.toThrow(/Unrestricted proxy trust is not allowed/);
  });

  it('reports a missing database URL', async () => {
    await expect(
      loadAppConfig({ SESSION_SECRET: sessionSecret }),
    ).rejects.toThrow(/DATABASE_URL is required/);
  });

  it('validates the database URL without HTTP configuration', async () => {
    await expect(loadDatabaseUrl({ DATABASE_URL: databaseUrl })).resolves.toBe(
      databaseUrl,
    );

    const malformed = {
      DATABASE_URL: 'http://example.com/db',
      SESSION_SECRET: sessionSecret,
    };
    const applicationError = await loadAppConfig(malformed).then(
      () => {
        throw new Error('expected invalid configuration');
      },
      (error: unknown) => error,
    );
    const databaseError = await loadDatabaseUrl({
      DATABASE_URL: malformed.DATABASE_URL,
    }).then(
      () => {
        throw new Error('expected invalid configuration');
      },
      (error: unknown) => error,
    );
    expect(databaseError).toBeInstanceOf(Error);
    expect(applicationError).toBeInstanceOf(Error);
    expect((databaseError as Error).message).toBe(
      (applicationError as Error).message,
    );
  });

  it('reports a malformed database URL', async () => {
    await expect(
      loadAppConfig({
        DATABASE_URL: 'http://example.com/db',
        SESSION_SECRET: sessionSecret,
      }),
    ).rejects.toThrow(/DATABASE_URL must be a postgres or postgresql URL/);
  });

  it('reports a missing or short session secret', async () => {
    await expect(loadAppConfig({ DATABASE_URL: databaseUrl })).rejects.toThrow(
      /SESSION_SECRET is required/,
    );
    await expect(
      loadAppConfig({
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: 'too-short',
      }),
    ).rejects.toThrow(/SESSION_SECRET must be at least 32 characters/);
  });

  it('leaves the outbox poller off unless WORKER_POLL_MS is a positive integer', async () => {
    const base = { DATABASE_URL: databaseUrl, SESSION_SECRET: sessionSecret };
    expect((await loadAppConfig(base)).workerPollMs).toBeUndefined();
    expect(
      (await loadAppConfig({ ...base, WORKER_POLL_MS: ' ' })).workerPollMs,
    ).toBeUndefined();
    expect(
      (await loadAppConfig({ ...base, WORKER_POLL_MS: '500' })).workerPollMs,
    ).toBe(500);

    for (const invalid of ['0', '-1', '1.5', 'soon']) {
      await expect(
        loadAppConfig({ ...base, WORKER_POLL_MS: invalid }),
      ).rejects.toThrow(
        /WORKER_POLL_MS must be a positive integer of milliseconds/,
      );
    }
  });

  it('does not include secret values in configuration errors', async () => {
    const secret = 'super-secret-value-that-must-not-leak';
    const password = 's3cret-db-password';
    try {
      await loadAppConfig({
        DATABASE_URL: `http://user:${password}@127.0.0.1/db`,
        SESSION_SECRET: secret,
      });
      throw new Error('expected invalid configuration');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).not.toContain(password);
      expect(message).toMatch(/DATABASE_URL/);
    }
  });
});
