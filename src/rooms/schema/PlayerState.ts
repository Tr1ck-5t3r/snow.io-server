import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string")
  sessionId = "";

  @type("number")
  x = 0;

  @type("number")
  y = 0;

  @type("number")
  z = 0;

  @type("number")
  rotationY = 0;
}
