export class TimeUtils {
    /**
     * Format seconds to HH:MM:SS
     */
    static formatDuration(seconds) {
        if (!seconds)
            return '00:00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    /**
     * Format date to localized string
     */
    static formatDate(dateString, locale = 'de-DE') {
        return new Date(dateString).toLocaleDateString(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
    /**
     * Format date and time for editing (DD/MM/YYYY HH:MM:SS)
     */
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
    /**
     * Parse European format date (DD/MM/YYYY HH:MM:SS) to ISO format
     */
    static parseEuropeanDateTime(dateTimeString) {
        if (!dateTimeString)
            return null;
        const parts = dateTimeString.split(' ');
        if (parts.length !== 2)
            return dateTimeString;
        const [datePart, timePart] = parts;
        const [day, month, year] = datePart.split('/');
        if (!day || !month || !year)
            return dateTimeString;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`;
    }
    /**
     * Calculate duration in seconds between two timestamps
     */
    static calculateDuration(startTime, endTime) {
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        if (endDate > startDate) {
            return Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
        }
        return 0;
    }
    /**
     * Get current week's start and end dates (Sunday to Saturday)
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
    /**
     * Get ISO timestamp for current time
     */
    static getCurrentTimestamp() {
        return new Date().toISOString();
    }
    /**
     * Check if date is today
     */
    static isToday(dateString) {
        const date = new Date(dateString);
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    }
    /**
     * Calculate percentage of time spent compared to target
     */
    static calculateTimePercentage(actual, target) {
        if (target === 0)
            return 0;
        return Math.min(100, Math.round((actual / target) * 100));
    }

    /**
     * Validate start/end dates for task editing
     * Ensures duration is never negative
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Object} { startDate, endDate, duration } - Validated dates and calculated duration
     */
    static validateTaskDates(startDate, endDate) {
        let correctedStart = new Date(startDate);
        let correctedEnd = new Date(endDate);

        // Calculate current duration
        let duration = Math.floor((correctedEnd.getTime() - correctedStart.getTime()) / 1000);

        // If duration is negative, it means start > end
        // In this case, keep duration at 0 and set end = start
        if (duration < 0) {
            correctedEnd = new Date(correctedStart);
            duration = 0;
        }

        return {
            startDate: correctedStart,
            endDate: correctedEnd,
            duration
        };
    }

    /**
     * Format timestamp for database storage (YYYY-MM-DD HH:MM:SS)
     * @param {Date} date - JavaScript Date object
     * @returns {string} - Formatted timestamp
     */
    static formatTimestampForDB(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Parse timestamp from database (supports both ISO8601 and local format)
     * @param {string} timestamp - Timestamp string from database
     * @returns {Date} - JavaScript Date object
     */
    static parseTimestampFromDB(timestamp) {
        if (!timestamp) return new Date();

        // Parse local time from database
        if (timestamp.includes('T')) {
            const localTimeStr = timestamp.replace('T', ' ').substring(0, 19);
            const [datePart, timePart] = localTimeStr.split(' ');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes, seconds] = timePart.split(':').map(Number);
            return new Date(year, month - 1, day, hours, minutes, seconds || 0);
        }
        return new Date(timestamp);
    }

    /**
     * Adjust time by minutes (automatically handles hours and days overflow)
     * @param {Date} date - Date to adjust
     * @param {number} minutesDelta - Minutes to add/subtract (positive or negative)
     * @returns {Date} - New adjusted date
     */
    static adjustTimeByMinutes(date, minutesDelta) {
        const newDate = new Date(date);
        newDate.setMinutes(newDate.getMinutes() + minutesDelta);
        return newDate;
    }

    /**
     * Adjust date by days (automatically handles months and years overflow)
     * Preserves time (hours, minutes, seconds)
     * @param {Date} date - Date to adjust
     * @param {number} daysDelta - Days to add/subtract (positive or negative)
     * @returns {Date} - New adjusted date with preserved time
     */
    static adjustDateByDays(date, daysDelta) {
        const newDate = new Date(date.getTime()); // Clone preserving exact time
        newDate.setDate(newDate.getDate() + daysDelta);
        return newDate;
    }

    /**
     * Adjust start date/time with smart logic
     * - Decrease: always allowed
     * - Increase: if would make duration negative, move both start and end together
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {number} delta - Minutes or days to adjust
     * @param {string} type - 'minutes' or 'days'
     * @returns {Object} { startDate, endDate } - Adjusted dates
     */
    static adjustStartDateTime(startDate, endDate, delta, type = 'minutes') {
        let newStart = type === 'minutes'
            ? this.adjustTimeByMinutes(startDate, delta)
            : this.adjustDateByDays(startDate, delta);

        let newEnd = new Date(endDate);

        // If increasing start and it would create negative duration
        if (delta > 0 && newStart.getTime() > endDate.getTime()) {
            // Move both start and end together (preserve duration)
            const currentDuration = endDate.getTime() - startDate.getTime();
            newEnd = new Date(newStart.getTime() + currentDuration);
        }

        return { startDate: newStart, endDate: newEnd };
    }

    /**
     * Adjust end date/time with smart logic
     * - Increase: always allowed
     * - Decrease: only if doesn't create negative duration
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {number} delta - Minutes or days to adjust
     * @param {string} type - 'minutes' or 'days'
     * @returns {Date|null} - Adjusted end date or null if not allowed
     */
    static adjustEndDateTime(startDate, endDate, delta, type = 'minutes') {
        const newEnd = type === 'minutes'
            ? this.adjustTimeByMinutes(endDate, delta)
            : this.adjustDateByDays(endDate, delta);

        // If decreasing end and it would create negative duration, don't allow
        if (delta < 0 && newEnd.getTime() <= startDate.getTime()) {
            return null; // Not allowed
        }

        return newEnd;
    }
}
