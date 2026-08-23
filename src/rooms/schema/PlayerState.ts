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

  // input axes recorded each message, consumed by simulation tick
  @type("number")
  inputForward = 0;

  @type("number")
  inputRight = 0;

  @type("number")
  velocityX = 0;

  @type("number")
  velocityZ = 0;
}
