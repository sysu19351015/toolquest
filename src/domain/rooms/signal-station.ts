import type { RoomDefinition } from "../types.js";

export const SIGNAL_STATION_ROOM: RoomDefinition = {
  id: "signal-station",
  title: "Signal Station",
  version: "1.0.0",
  difficulty: "intermediate",
  parActions: 12,
  introduction:
    "A storm has silenced a remote signal station. Restore power, calibrate the rooftop antenna, and transmit the three-digit emergency code.",
  initialLocationId: "entry_hall",
  requiredSubmitLocationId: "rooftop",
  requiredSubmitFlag: "antenna_calibrated",
  answer: "821",
  maxAttempts: 3,
  locations: {
    entry_hall: {
      id: "entry_hall",
      name: "Entry Hall",
      description:
        "Rain rattles the shutters. A faded distress notice hangs beside doors to the workshop and control room.",
      exits: [
        {
          id: "to_workshop",
          label: "Workshop door",
          to: "workshop",
          description: "Enter the maintenance workshop."
        },
        {
          id: "to_control_room",
          label: "Control-room door",
          to: "control_room",
          description: "Enter the dark control room."
        }
      ]
    },
    workshop: {
      id: "workshop",
      name: "Maintenance Workshop",
      description:
        "Shelves of radio parts line the walls. A frequency chart and a ceramic fuse lie on the workbench.",
      exits: [
        {
          id: "to_entry_hall",
          label: "Hall door",
          to: "entry_hall",
          description: "Return to the entry hall."
        }
      ]
    },
    control_room: {
      id: "control_room",
      name: "Control Room",
      description:
        "Dead instruments surround a breaker panel. Stairs climb to the rooftop antenna.",
      exits: [
        {
          id: "to_entry_hall",
          label: "Hall door",
          to: "entry_hall",
          description: "Return to the entry hall."
        },
        {
          id: "to_rooftop",
          label: "Rooftop stairs",
          to: "rooftop",
          description: "Climb to the antenna platform."
        }
      ]
    },
    rooftop: {
      id: "rooftop",
      name: "Rooftop Antenna",
      description:
        "Wind tears across the platform. The antenna console waits beside the transmitter keypad.",
      exits: [
        {
          id: "to_control_room",
          label: "Control-room stairs",
          to: "control_room",
          description: "Descend to the control room."
        }
      ]
    }
  },
  items: {
    ceramic_fuse: {
      id: "ceramic_fuse",
      name: "Ceramic Fuse",
      description: "A high-voltage fuse sized for the station breaker panel."
    }
  },
  objects: {
    distress_notice: {
      id: "distress_notice",
      name: "Distress Notice",
      description: "A water-stained emergency transmission notice.",
      details:
        "The notice reads: 'Emergency codes begin with the number of red lamps on the mast: eight.' The first digit is 8.",
      locationId: "entry_hall",
      interactionIds: []
    },
    frequency_chart: {
      id: "frequency_chart",
      name: "Frequency Chart",
      description: "A chart of reserved coastal radio channels.",
      details:
        "Channel 21 is circled beside the note: 'Finish every emergency code on the rescue channel.' The final two digits are 21.",
      locationId: "workshop",
      interactionIds: []
    },
    ceramic_fuse: {
      id: "ceramic_fuse",
      name: "Ceramic Fuse",
      description: "An intact fuse on the maintenance bench.",
      details: "The fuse label matches the station's main breaker panel.",
      locationId: "workshop",
      interactionIds: ["take_ceramic_fuse"],
      hiddenWhenFlag: "ceramic_fuse_taken"
    },
    breaker_panel: {
      id: "breaker_panel",
      name: "Breaker Panel",
      description: "The main breaker has an empty fuse socket.",
      details:
        "The station cannot power the antenna until a compatible ceramic fuse is installed.",
      locationId: "control_room",
      interactionIds: ["restore_station_power"]
    },
    antenna_console: {
      id: "antenna_console",
      name: "Antenna Console",
      description: "A calibration wheel beside the transmitter keypad.",
      details:
        "The calibration sequence can run only after station power is restored.",
      locationId: "rooftop",
      interactionIds: ["calibrate_antenna"]
    }
  },
  interactions: {
    take_ceramic_fuse: {
      id: "take_ceramic_fuse",
      title: "Take the ceramic fuse",
      description: "Place the intact fuse in your inventory.",
      targetId: "ceramic_fuse",
      locationId: "workshop",
      successMessage: "You take the ceramic fuse.",
      effect: {
        type: "take_item",
        itemId: "ceramic_fuse",
        takenFlag: "ceramic_fuse_taken"
      }
    },
    restore_station_power: {
      id: "restore_station_power",
      title: "Restore station power",
      description: "Install the ceramic fuse in the breaker panel.",
      targetId: "breaker_panel",
      locationId: "control_room",
      successMessage:
        "The fuse seats firmly. Lights flicker on throughout the station.",
      effect: {
        type: "set_flag",
        flag: "station_powered",
        value: true,
        requiredItemId: "ceramic_fuse",
        consumeItem: true
      }
    },
    calibrate_antenna: {
      id: "calibrate_antenna",
      title: "Calibrate the antenna",
      description: "Run the powered antenna calibration sequence.",
      targetId: "antenna_console",
      locationId: "rooftop",
      successMessage:
        "The antenna locks onto the rescue frequency. The transmitter is ready.",
      effect: {
        type: "set_flag",
        flag: "antenna_calibrated",
        value: true,
        requiredFlag: "station_powered"
      }
    }
  }
};
