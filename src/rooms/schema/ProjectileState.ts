import { Schema, type } from "@colyseus/schema";

export class ProjectileState extends Schema {
  @type("string")
  id = "";

  @type("string")
  playerId = "";

  @type("number")
  x = 0;

  @type("number")
  y = 0;

  @type("number")
  z = 0;

  @type("number")
  vx = 0;

  @type("number")
  vy = 0;

  @type("number")
  vz = 0;

  @type("number")
  timestamp = 0;
}
