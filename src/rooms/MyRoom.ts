import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import { PlayerState } from "./schema/PlayerState";
import { applyMovement } from "../simulation/movement";

export class MyRoom extends Room<MyRoomState> {
  maxClients = 4;

  onCreate() {
    this.setState(new MyRoomState());

    this.onMessage("input", (client, input) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // interpret and sanitize directional input coming from the client
      player.inputForward = isNaN(input.forward) ? 0 : input.forward;
      player.inputRight = isNaN(input.right) ? 0 : input.right;
      player.rotationY = isNaN(input.rotY) ? player.rotationY : input.rotY;

      console.log("Received input from", client.sessionId, {
        forward: player.inputForward,
        right: player.inputRight,
        rotY: player.rotationY,
      });
      console.log("Player state after input:", {
        x: player.x,
        z: player.z,
      });
    });

    // schedule a simulation tick to apply movement and broadcast patches
    this.setSimulationInterval(this.update.bind(this), 1000 / 60);
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    player.sessionId = client.sessionId;

    this.state.players.set(client.sessionId, player);
    console.log(client.sessionId, "joined");
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(client.sessionId, "left");
  }

  update(deltaTime: number) {
    const dt = deltaTime / 1000;
    for (const player of this.state.players.values()) {
      const prevX = player.x;
      const prevZ = player.z;

      // apply movement based on stored input values
      applyMovement(
        player,
        { forward: player.inputForward, right: player.inputRight, rotY: player.rotationY },
        dt
      );

      if (player.x !== prevX || player.z !== prevZ) {
        console.log("Player moved", player.sessionId, player.x.toFixed(2), player.z.toFixed(2));
      }
    }
  }
}
