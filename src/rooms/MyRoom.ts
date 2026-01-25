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

      // Log received input
      console.log("Received input from client:", input);

      // Validate inputs to ensure they are numbers
      const validInput = {
        forward: input.forward || 0,
        backward: input.backward || 0,
        left: input.left || 0,
        right: input.right || 0,
        rotY: isNaN(input.rotY) ? 0 : input.rotY,
      };

      player.rotationY = validInput.rotY;

      // Apply movement logic
      applyMovement(player, validInput, 1 / 60);

      // Log updated player state
      console.log("Updated player state:", player);
    });

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
    const SPEED = 5;

    for (const player of this.state.players.values()) {
      player.x += player.inputX * SPEED * dt;
      player.z += player.inputZ * SPEED * dt;
    }
  }
}
