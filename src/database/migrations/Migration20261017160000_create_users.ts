import { Migration } from '@mikro-orm/migrations';

export class Migration20261017160000_create_users extends Migration {
  override name = 'Migration20261017160000_create_users';

  override up(): void {
    this.addSql(
      'create table "users" ("id" serial primary key, "email" varchar(255) not null, "password_hash" varchar(255) not null);',
    );
    this.addSql('alter table "users" add constraint "users_email_unique" unique ("email");');
  }

  override down(): void {
    this.addSql('drop table if exists "users" cascade;');
  }
}
