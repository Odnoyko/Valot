import Gda from 'gi://Gda';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { executeNonSelectCommand, setupDatabase } from '../dbinitialisation.js';

const conn = setupDatabase(); // Один раз в начале

export function saveTask(name, project, startTime, endTime, spentMicroseconds) {
  const sql = `
    INSERT INTO Task (name, project_id, start_time, end_time, time_spent)
    VALUES (?, (SELECT id FROM Project WHERE name = ?), ?, ?, ?);
  `;

  const params = new Gda.Set();

const hName    = new Gda.Holder({ id: 'name',    g_type: GObject.TYPE_STRING });
const hProject = new Gda.Holder({ id: 'project', g_type: GObject.TYPE_STRING });
const hStart   = new Gda.Holder({ id: 'start',   g_type: GObject.TYPE_STRING });
const hEnd     = new Gda.Holder({ id: 'end',     g_type: GObject.TYPE_STRING });
const hSpent   = new Gda.Holder({ id: 'spent',   g_type: GObject.TYPE_INT64 });

hName.set_value(name);
hProject.set_value(project);
hStart.set_value(startTime);
hEnd.set_value(endTime);
hSpent.set_value(spentMicroseconds);

  params.add_holder(hName);
  params.add_holder(hProject);
  params.add_holder(hStart);
  params.add_holder(hEnd);
  params.add_holder(hSpent);

  executeNonSelectCommand(conn, sql, params);
}
