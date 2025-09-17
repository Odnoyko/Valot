/**
 * Date filtering utilities for task filtering
 */

export class DateFilters {
    /**
     * Check if a date is today
     */
    static isToday(dateString) {
        if (!dateString) return false;
        const taskDate = new Date(dateString);
        const today = new Date();
        return taskDate.toDateString() === today.toDateString();
    }

    /**
     * Check if a date is in this week
     */
    static isThisWeek(dateString) {
        if (!dateString) return false;
        const taskDate = new Date(dateString);
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // End of week (Saturday)
        
        return taskDate >= startOfWeek && taskDate <= endOfWeek;
    }

    /**
     * Check if a date is in this month
     */
    static isThisMonth(dateString) {
        if (!dateString) return false;
        const taskDate = new Date(dateString);
        const today = new Date();
        return taskDate.getMonth() === today.getMonth() && 
               taskDate.getFullYear() === today.getFullYear();
    }

    /**
     * Check if a date is in the last N days
     */
    static isInLastDays(dateString, days) {
        if (!dateString) return false;
        const taskDate = new Date(dateString);
        const today = new Date();
        const nDaysAgo = new Date(today);
        nDaysAgo.setDate(today.getDate() - days);
        
        return taskDate >= nDaysAgo && taskDate <= today;
    }
}