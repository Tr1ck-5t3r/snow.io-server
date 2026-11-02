import { Schema, type } from "@colyseus/schema";

export class DecalState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") nx = 0;
  @type("number") ny = 1;
  @type("number") nz = 0;
  @type("number") createdAt = 0;
  @type("number") fadeAt = 0;
  @type("number") expiresAt = 0;
}
