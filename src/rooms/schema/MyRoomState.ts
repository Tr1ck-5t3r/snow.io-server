import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { ProjectileState } from "./ProjectileState";

export class MyRoomState extends Schema {
  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type({ map: ProjectileState })
  projectiles = new MapSchema<ProjectileState>();
}
