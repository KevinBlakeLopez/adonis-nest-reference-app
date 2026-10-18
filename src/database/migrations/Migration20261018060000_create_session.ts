import { Migration } from '@mikro-orm/migrations';

export class Migration20261018060000_create_session extends Migration {
  override name = 'Migration20261018060000_create_session';

  override up(): void {
    this.addSql(
      'create table "session" ("sid" varchar not null, "sess" json not null, "expire" timestamp(6) not null, constraint "session_pkey" primary key ("sid"));',
    );
    this.addSql('create index "IDX_session_expire" on "session" ("expire");');
  }

  override down(): void {
    this.addSql('drop table if exists "session" cascade;');
  }
}
