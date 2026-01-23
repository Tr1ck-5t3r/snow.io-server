import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import { PlayerState } from "./schema/PlayerState";
export class MyRoom extends Room<MyRoomState> {
  maxClients = 4;

  onCreate() {
    this.setState(new MyRoomState());

    this.onMessage("input", (client, input) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      player.x += input.dx;
      player.z += input.dz;
      player.rotationY = input.rotY;

      // optional: clamp player to world bounds
      player.x = Math.max(-10, Math.min(10, player.x));
      player.z = Math.max(-10, Math.min(10, player.z));
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
