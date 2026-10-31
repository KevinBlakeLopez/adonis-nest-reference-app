import { Migration } from '@mikro-orm/migrations';

export class Migration20261031100000_create_orders extends Migration {
  override name = 'Migration20261031100000_create_orders';

  override up(): void {
    this.addSql(`
      create table "orders" (
        "id" serial primary key,
        "user_id" int not null,
        "idempotency_key" varchar(255) not null,
        "sku" varchar(200) not null,
        "quantity" integer not null,
        "created_at" timestamptz not null,
        constraint "orders_quantity_check" check ("quantity" > 0)
      );
    `);
    this.addSql(
      'alter table "orders" add constraint "orders_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;',
    );
    this.addSql(
      'alter table "orders" add constraint "orders_user_id_idempotency_key_unique" unique ("user_id", "idempotency_key");',
    );

    this.addSql(`
      create table "outbox" (
        "id" serial primary key,
        "order_id" int not null,
        "processed_at" timestamptz null,
        "created_at" timestamptz not null
      );
    `);
    this.addSql(
      'alter table "outbox" add constraint "outbox_order_id_foreign" foreign key ("order_id") references "orders" ("id") on delete cascade;',
    );
    this.addSql(
      'alter table "outbox" add constraint "outbox_order_id_unique" unique ("order_id");',
    );

    this.addSql(`
      create table "dispatches" (
        "id" serial primary key,
        "outbox_id" int not null,
        "created_at" timestamptz not null
      );
    `);
    this.addSql(
      'alter table "dispatches" add constraint "dispatches_outbox_id_foreign" foreign key ("outbox_id") references "outbox" ("id") on delete cascade;',
    );
    this.addSql(
      'alter table "dispatches" add constraint "dispatches_outbox_id_unique" unique ("outbox_id");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "dispatches" cascade;');
    this.addSql('drop table if exists "outbox" cascade;');
    this.addSql('drop table if exists "orders" cascade;');
  }
}
