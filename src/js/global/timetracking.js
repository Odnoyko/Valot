console.log("timetracking.js connected");

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { saveTask } from './addtask.js'; // если ты вызываешь из js/global/
console.log("Adw & Glib and DB");

let isTracking = false;
let startTime = 0;
let intervalId = null;


export function timeTrack(button, input , label) {
  console.log(button.get_sensitive());
  console.log(input);
  button.connect("clicked", () => {
    if (isTracking) {
      isTracking = false;
      console.log("Track Off");
      const endTime = GLib.get_monotonic_time();
      const spent = endTime - startTime;

      GLib.source_remove(intervalId);
      intervalId = null;

      const now = GLib.DateTime.new_now_local();
      const startStr = now.format('%Y-%m-%d %H:%M:%S');
      const endStr = now.format('%Y-%m-%d %H:%M:%S');

      const taskName = input.get_text();
      const projectName = "Default";

      saveTask(taskName, projectName, startStr, endStr, spent);
    } else {
      isTracking = true;
      startTime = GLib.get_monotonic_time();
      console.log("Track On");

       intervalId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        const now = GLib.get_monotonic_time();
        const deltaSec = Math.floor((now - startTime) / 1_000_000);
        const hh = String(Math.floor(deltaSec / 3600)).padStart(2, '0');
        const mm = String(Math.floor((deltaSec % 3600) / 60)).padStart(2, '0');
        const ss = String(deltaSec % 60).padStart(2, '0');
        label.set_label(`${hh}:${mm}:${ss}`);
        return GLib.SOURCE_CONTINUE;
      });
    }
  });
} 
