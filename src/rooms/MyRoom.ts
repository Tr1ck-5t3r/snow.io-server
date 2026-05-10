import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import { PlayerState } from "./schema/PlayerState";
import { ProjectileState } from "./schema/ProjectileState";
import { applyMovement } from "../simulation/movement";

const COLLISION_RADIUS = 1.5;
const PROJECTILE_LIFETIME = 10000; // 10 seconds in ms
const GRAVITY = 9.81;

export class MyRoom extends Room<MyRoomState> {
  maxClients = 4;
  private projectileCounter = 0;

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

    this.onMessage("shoot", (client, data) => {
      const shooter = this.state.players.get(client.sessionId);
      if (!shooter) return;

      const projectile = new ProjectileState();
      projectile.id = `projectile_${this.projectileCounter++}`;
      projectile.playerId = client.sessionId;
      projectile.x = data.position[0];
      projectile.y = data.position[1];
      projectile.z = data.position[2];
      projectile.vx = data.velocity[0];
      projectile.vy = data.velocity[1];
      projectile.vz = data.velocity[2];
      projectile.timestamp = data.timestamp;

      this.state.projectiles.set(projectile.id, projectile);
      console.log("Created projectile", projectile.id, "from", client.sessionId, {
        position: [projectile.x, projectile.y, projectile.z],
        velocity: [projectile.vx, projectile.vy, projectile.vz],
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

  private simulateProjectiles(deltaTime: number) {
    const dt = deltaTime / 1000;
    const gravity = GRAVITY * dt;

    // Update projectile positions and check collisions
    const projectilesToRemove: string[] = [];

    for (const [projectileId, projectile] of this.state.projectiles.entries()) {
      // Apply gravity
      projectile.vy -= gravity;

      // Update position
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;

      // Check if projectile is too old
      const age = Date.now() - projectile.timestamp;
      if (age > PROJECTILE_LIFETIME) {
        projectilesToRemove.push(projectileId);
        continue;
      }

      // Check collision with players
      let hitPlayer = false;
      for (const [playerId, player] of this.state.players.entries()) {
        if (playerId === projectile.playerId) continue; // Don't hit the shooter

        const dx = projectile.x - player.x;
        const dy = projectile.y;
        const dz = projectile.z - player.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < COLLISION_RADIUS) {
          console.log("Projectile", projectileId, "hit player", playerId);
          projectilesToRemove.push(projectileId);
          hitPlayer = true;
          break;
        }
      }

      // Remove if below ground
      if (projectile.y < -10) {
        projectilesToRemove.push(projectileId);
      }
    }

    // Remove dead projectiles
    for (const projectileId of projectilesToRemove) {
      this.state.projectiles.delete(projectileId);
    }
  }

  update(deltaTime: number) {
    const dt = deltaTime / 1000;
    
    // Simulate player movement
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

    // Simulate projectiles
    this.simulateProjectiles(deltaTime);
  }
}
