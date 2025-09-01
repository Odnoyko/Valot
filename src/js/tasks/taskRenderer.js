import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

// Task rendering functionality
export class TaskRenderer {
    constructor(timeUtils, allProjects, parentWindow) {
        this.timeUtils = timeUtils;
        this.allProjects = allProjects;
        this.parentWindow = parentWindow;
    }

    renderSingleTask(task) {
        // Calculate cost
        const cost = (task.duration / 3600) * (task.client_rate || 0);
        const costText = cost > 0 ? ` • €${cost.toFixed(2)}` : '';
        
        // Find project color
        const project = this.allProjects.find(p => p.id === task.project_id);
        const projectColor = project ? project.color : '#9a9996';
        
        console.log(`Task: ${task.name}, Project: ${task.project}, Project ID: ${task.project_id}, Color: ${projectColor}`);
        
        // Create subtitle with colored dot using Pango markup
        const coloredSubtitle = task.isActive 
            ? `<span color="${projectColor}">●</span> ${task.project} • ${task.client} • Currently tracking • ${this.timeUtils.formatDate(task.start)}`
            : `<span color="${projectColor}">●</span> ${task.project} • ${task.client} • ${this.timeUtils.formatDate(task.start)}`;
        
        const row = new Adw.ActionRow({
            title: task.name,
            subtitle: coloredSubtitle,
            use_markup: true
        });
        
        if (task.isActive) {
            row.add_css_class('tracking-active');
        }

        if (this.parentWindow.selectedTasks && this.parentWindow.selectedTasks.has(task.id)) {
            row.add_css_class('selected-task');
        }
        
        // Create suffix container with time and buttons
        const suffixBox = this._createSuffixBox(task, cost);
        row.add_suffix(suffixBox);
        
        if (this.parentWindow.taskRowMap) {
            this.parentWindow.taskRowMap.set(row, task.id);
        }
        
        // Add right-click gesture for task selection
        this._addRightClickGesture(row, task);
        
        return row;
    }

    renderTaskGroup(group) {
        const costText = group.totalCost > 0 ? ` • €${group.totalCost.toFixed(2)}` : '';
        const activeText = group.hasActive ? ' • Currently tracking' : '';
        
        // Find project color
        const project = this.allProjects.find(p => p.id === group.latestTask.project_id);
        const projectColor = project ? project.color : '#9a9996';
        
        // Create group subtitle with colored dot using Pango markup
        const groupColoredSubtitle = `<span color="${projectColor}">●</span> ${group.latestTask.project} • ${group.latestTask.client}${activeText}`;
        
        const groupRow = new Adw.ExpanderRow({
            title: `${group.baseName} (${group.tasks.length} sessions)`,
            subtitle: groupColoredSubtitle,
            use_markup: true
        });
        
        // Add group time and button to suffix
        const groupSuffixBox = this._createGroupSuffixBox(group, costText);
        groupRow.add_suffix(groupSuffixBox);
        
        if (group.hasActive) {
            groupRow.add_css_class('tracking-active');
        }
        
        // Add individual tasks as rows within the expander
        group.tasks.forEach(task => {
            const taskRow = this._renderIndividualTaskInGroup(task);
            groupRow.add_row(taskRow);
        });
        
        return groupRow;
    }

    _createSuffixBox(task, cost) {
        const suffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });
        
        // Add time display (duration or cost)
        if (!task.isActive && task.duration > 0) {
            const timeLabel = new Gtk.Label({
                label: this.timeUtils.formatDuration(task.duration),
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.END
            });
            
            if (cost > 0) {
                timeLabel.set_label(`${this.timeUtils.formatDuration(task.duration)} • €${cost.toFixed(2)}`);
            }
            
            suffixBox.append(timeLabel);
        }
        
        // Create button container
        const buttonBox = new Gtk.Box({
            spacing: 6
        });
        
        // Add edit button
        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Edit Task'
        });
        editBtn.connect('clicked', () => this.parentWindow._editTask(task.id));
        buttonBox.append(editBtn);
        
        // Add tracking button
        const trackBtn = new Gtk.Button({
            icon_name: task.isActive ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic',
            css_classes: ['flat'],
            tooltip_text: task.isActive ? 'Stop Tracking' : 'Start Tracking'
        });
        trackBtn.connect('clicked', () => {
            if (task.isActive) {
                this.parentWindow._stopCurrentTracking();
            } else {
                this.parentWindow._startTrackingFromTask(task);
            }
        });
        
        // Apply gray color to the icon
        const icon = trackBtn.get_first_child();
        if (icon) {
            icon.add_css_class('dim-label');
        }
        
        buttonBox.append(trackBtn);
        suffixBox.append(buttonBox);
        
        return suffixBox;
    }

    _createGroupSuffixBox(group, costText) {
        const groupSuffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });
        
        // Add group total time
        const groupTimeLabel = new Gtk.Label({
            label: `${this.timeUtils.formatDuration(group.totalDuration)}${costText}`,
            css_classes: ['caption', 'dim-label'],
            halign: Gtk.Align.END
        });
        groupSuffixBox.append(groupTimeLabel);
        
        // Add group-level tracking button
        const groupTrackBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Start New Session'
        });
        groupTrackBtn.connect('clicked', () => this.parentWindow._startTrackingFromTask(group.latestTask));
        
        // Apply gray color to the icon
        const groupIcon = groupTrackBtn.get_first_child();
        if (groupIcon) {
            groupIcon.add_css_class('dim-label');
        }
        
        groupSuffixBox.append(groupTrackBtn);
        
        return groupSuffixBox;
    }

    _renderIndividualTaskInGroup(task) {
        const cost = (task.duration / 3600) * (task.client_rate || 0);
        const costText = cost > 0 ? ` • €${cost.toFixed(2)}` : '';
        
        const taskRow = new Adw.ActionRow({
            title: task.name,
            subtitle: task.isActive 
                ? `Currently tracking • ${this.timeUtils.formatDate(task.start)}`
                : `${this.timeUtils.formatDate(task.start)}`
        });
        
        // Add time display for individual task in group
        const taskSuffixBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END
        });
        
        // Add time display (duration or cost) for individual tasks
        if (!task.isActive && task.duration > 0) {
            const taskTimeLabel = new Gtk.Label({
                label: this.timeUtils.formatDuration(task.duration),
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.END
            });
            
            if (cost > 0) {
                taskTimeLabel.set_label(`${this.timeUtils.formatDuration(task.duration)} • €${cost.toFixed(2)}`);
            }
            
            taskSuffixBox.append(taskTimeLabel);
        }
        
        if (task.isActive) {
            taskRow.add_css_class('tracking-active');
        }
        
        // Create button container for individual task
        const taskButtonBox = this._createTaskButtonBox(task);
        taskSuffixBox.append(taskButtonBox);
        taskRow.add_suffix(taskSuffixBox);
        
        if (this.parentWindow.taskRowMap) {
            this.parentWindow.taskRowMap.set(taskRow, task.id);
        }
        
        // Add right-click gesture for individual tasks within groups
        this._addRightClickGesture(taskRow, task);
        
        return taskRow;
    }

    _createTaskButtonBox(task) {
        const taskButtonBox = new Gtk.Box({
            spacing: 6
        });
        
        // Edit button
        const editBtn = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: 'Edit Task'
        });
        editBtn.connect('clicked', () => this.parentWindow._editTask(task.id));
        taskButtonBox.append(editBtn);
        
        // Tracking button
        const trackBtn = new Gtk.Button({
            icon_name: task.isActive ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic',
            css_classes: ['flat'],
            tooltip_text: task.isActive ? 'Stop Tracking' : 'Start Tracking'
        });
        trackBtn.connect('clicked', () => {
            if (task.isActive) {
                this.parentWindow._stopCurrentTracking();
            } else {
                this.parentWindow._startTrackingFromTask(task);
            }
        });
        
        // Apply gray color to the icon
        const icon = trackBtn.get_first_child();
        if (icon) {
            icon.add_css_class('dim-label');
        }
        
        taskButtonBox.append(trackBtn);
        
        return taskButtonBox;
    }

    _addRightClickGesture(row, task) {
        const gesture = new Gtk.GestureClick({
            button: 3
        });
        
        gesture.connect('pressed', (gesture, n_press, x, y) => {
            if (this.parentWindow.selectedTasks) {
                if (this.parentWindow.selectedTasks.has(task.id)) {
                    this.parentWindow.selectedTasks.delete(task.id);
                    row.remove_css_class('selected-task');
                } else {
                    this.parentWindow.selectedTasks.add(task.id);
                    row.add_css_class('selected-task');
                }
            }
        });
        
        row.add_controller(gesture);
    }
}