// Time utility functions
export class TimeUtils {
    static formatDuration(seconds) {
        if (!seconds) return '00:00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    static formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    static formatDateTimeForEdit(dateString) {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }

    static parseEuropeanDateTime(dateTimeString) {
        if (!dateTimeString) return null;
        
        const parts = dateTimeString.split(' ');
        if (parts.length !== 2) return dateTimeString;
        
        const [datePart, timePart] = parts;
        const [day, month, year] = datePart.split('/');
        
        if (!day || !month || !year) return dateTimeString;
        
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`;
    }

    static calculateDuration(startTime, endTime) {
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        
        if (endDate > startDate) {
            return Math.floor((endDate - startDate) / 1000);
        }
        return 0;
    }

    /**
     * Update weekly time display element with current data
     * @param {Gtk.Widget} weeklyTimeElement - The weekly time row element
     * @param {Array} allTasks - Array of all tasks
     * @param {number} additionalSeconds - Additional tracking seconds (optional)
     */
    static async updateWeeklyTimeDisplay(weeklyTimeElement, allTasks = [], additionalSeconds = 0) {
        if (!weeklyTimeElement) return;

        try {
            // Calculate current week (Sunday to Saturday)
            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            let weekTime = 0;
            let weekTasks = 0;

            // Calculate week time from existing tasks
            for (const task of allTasks) {
                if (!task.start) continue;
                
                const taskDate = new Date(task.start);
                if (taskDate >= startOfWeek && taskDate <= endOfWeek) {
                    weekTime += task.duration || 0;
                    weekTasks++;
                }
            }

            // Add additional tracking time
            weekTime += additionalSeconds;

            // Update display
            const timeText = TimeUtils.formatDuration(weekTime);
            const tasksText = weekTasks === 1 ? '1 task' : `${weekTasks} tasks`;
            weeklyTimeElement.set_subtitle(`${timeText} • ${tasksText}`);

            //(`📊 Weekly time updated: ${timeText} (${weekTasks} tasks)`);

        } catch (error) {
            //('❌ Error updating weekly time display:', error);
        }
    }

    /**
     * Get current week's start and end dates
     * @returns {Object} {startOfWeek, endOfWeek}
     */
    static getCurrentWeekRange() {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return { startOfWeek, endOfWeek };
    }
}