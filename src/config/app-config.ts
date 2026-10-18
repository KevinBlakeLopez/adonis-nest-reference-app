import vine, { ValidationError } from '@vinejs/vine';

export const sessionCookieName = 'sid';

/** Absolute session lifetime. The Postgres store records this as `expire`. */
export const sessionMaxAgeMs = 2 * 60 * 60 * 1000;

const sessionSecretMinLength = 32;

function databaseUrlField() {
  return vine.string().url({
    protocols: ['postgres', 'postgresql'],
    require_protocol: true,
    require_tld: false,
  });
}

const databaseEnvironment = vine.compile(
  vine.object({
    DATABASE_URL: databaseUrlField(),
  }),
);

const environment = vine.compile(
  vine.object({
    NODE_ENV: vine.enum(['development', 'test', 'production']).optional(),
    PORT: vine.number().min(1).max(65535).withoutDecimals().optional(),
    DATABASE_URL: databaseUrlField(),
    SESSION_SECRET: vine.string().minLength(sessionSecretMinLength),
  }),
);

export type NodeEnv = 'development' | 'test' | 'production';

export type AppConfig = {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  session: {
    secret: string;
    cookieName: typeof sessionCookieName;
    maxAgeMs: number;
    cookie: {
      httpOnly: true;
      sameSite: 'lax';
      secure: boolean;
      maxAge: number;
      path: '/';
    };
  };
  /**
   * Express `trust proxy` hop count. `false` trusts no forwarded headers.
   * `1` trusts one reverse-proxy hop. Unrestricted trust is not representable.
   */
  trustProxy: false | 1;
};

export const APP_CONFIG = Symbol('APP_CONFIG');

export class InvalidAppConfigError extends Error {
  constructor(messages: readonly string[]) {
    super(
      `Invalid application configuration:\n${messages
        .map((message) => `- ${message}`)
        .join('\n')}`,
    );
    this.name = 'InvalidAppConfigError';
  }
}

/**
 * Validates DATABASE_URL with the same Vine rule as {@link loadAppConfig}.
 * Migrations use this and ignore HTTP configuration.
 */
export async function loadDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const parsed = await databaseEnvironment.validate({
      DATABASE_URL: env.DATABASE_URL,
    });
    return parsed.DATABASE_URL;
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    throw new InvalidAppConfigError(validationMessages(error));
  }
}

/**
 * Reads process environment once. Production trusts one proxy hop unless
 * `TRUST_PROXY=false` disables it. `TRUST_PROXY=1` opts in outside production.
 * `TRUST_PROXY=true` is rejected.
 */
export async function loadAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppConfig> {
  const messages: string[] = [];
  let parsed: Awaited<ReturnType<typeof environment.validate>> | undefined;
  try {
    parsed = await environment.validate({
      NODE_ENV: blankToUndefined(env.NODE_ENV),
      PORT: blankToUndefined(env.PORT),
      DATABASE_URL: env.DATABASE_URL,
      SESSION_SECRET: env.SESSION_SECRET,
    });
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    messages.push(...validationMessages(error));
  }

  const nodeEnv = parsed?.NODE_ENV ?? 'development';
  let trustProxy: false | 1 | undefined;
  if (parsed || blankToUndefined(env.TRUST_PROXY) !== undefined) {
    try {
      trustProxy = parseTrustProxy(nodeEnv, env.TRUST_PROXY);
    } catch (error) {
      messages.push(
        error instanceof Error ? error.message : 'Invalid TRUST_PROXY',
      );
    }
  }

  if (!parsed || trustProxy === undefined) {
    throw new InvalidAppConfigError(messages);
  }

  const secure = nodeEnv === 'production';
  return {
    nodeEnv,
    port: parsed.PORT ?? 3000,
    databaseUrl: parsed.DATABASE_URL,
    session: {
      secret: parsed.SESSION_SECRET,
      cookieName: sessionCookieName,
      maxAgeMs: sessionMaxAgeMs,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        maxAge: sessionMaxAgeMs,
        path: '/',
      },
    },
    trustProxy,
  };
}

function parseTrustProxy(nodeEnv: NodeEnv, raw: string | undefined): false | 1 {
  const value = blankToUndefined(raw);
  if (value === undefined) {
    return nodeEnv === 'production' ? 1 : false;
  }
  if (value === '1') {
    return 1;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  throw new Error(
    'TRUST_PROXY must be "1" for one reverse-proxy hop or "false" for no proxy. Unrestricted proxy trust is not allowed.',
  );
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value;
}

function validationMessages(error: ValidationError): string[] {
  if (!Array.isArray(error.messages)) {
    return ['Application configuration is invalid'];
  }
  return error.messages.map((issue) => {
    if (!issue || typeof issue !== 'object') {
      return 'Application configuration is invalid';
    }
    const field = 'field' in issue ? String(issue.field) : '';
    const rule = 'rule' in issue ? String(issue.rule) : '';
    if (field === 'DATABASE_URL' && rule === 'required') {
      return 'DATABASE_URL is required';
    }
    if (field === 'DATABASE_URL' && rule === 'url') {
      return 'DATABASE_URL must be a postgres or postgresql URL';
    }
    if (field === 'SESSION_SECRET' && rule === 'required') {
      return 'SESSION_SECRET is required';
    }
    if (field === 'SESSION_SECRET' && rule === 'minLength') {
      return 'SESSION_SECRET must be at least 32 characters';
    }
    if (field === 'NODE_ENV') {
      return 'NODE_ENV must be development, test, or production';
    }
    if (field === 'PORT') {
      return 'PORT must be an integer from 1 to 65535';
    }
    return 'Application configuration is invalid';
  });
}
