import type { RoomCatalog } from "../application/ports.js";
import { SIGNAL_STATION_ROOM } from "../domain/rooms/signal-station.js";
import { THE_VAULT_ROOM } from "../domain/rooms/the-vault.js";
import type { RoomDefinition, RoomSummary } from "../domain/types.js";

export class BuiltInRoomCatalog implements RoomCatalog {
  private readonly rooms = new Map<string, RoomDefinition>([
    [THE_VAULT_ROOM.id, THE_VAULT_ROOM],
    [SIGNAL_STATION_ROOM.id, SIGNAL_STATION_ROOM]
  ]);

  public find(roomId: string): RoomDefinition | undefined {
    return this.rooms.get(roomId);
  }

  public list(): RoomSummary[] {
    return [...this.rooms.values()].map(
      ({ id, title, version, difficulty, parActions, introduction }) => ({
        id,
        title,
        version,
        difficulty,
        parActions,
        introduction
      })
    );
  }
}
