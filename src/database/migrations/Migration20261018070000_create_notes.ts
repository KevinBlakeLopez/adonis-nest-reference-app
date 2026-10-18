import { Migration } from '@mikro-orm/migrations';

export class Migration20261018070000_create_notes extends Migration {
  override name = 'Migration20261018070000_create_notes';

  override up(): void {
    this.addSql(
      'create table "notes" ("id" serial primary key, "user_id" int not null, "title" varchar(200) not null, "body" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null);',
    );
    this.addSql(
      'alter table "notes" add constraint "notes_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;',
    );
    this.addSql('create index "notes_user_id_index" on "notes" ("user_id");');
  }

  override down(): void {
    this.addSql('drop table if exists "notes" cascade;');
  }
}
