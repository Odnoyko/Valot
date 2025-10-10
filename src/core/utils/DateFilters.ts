/**
 * Date filtering and range utilities
 * Pure business logic - NO UI dependencies
 */

/**
 * Date range representation
 */
export interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Date filter preset types
 */
export type DateFilterPreset =
    | 'today'
    | 'yesterday'
    | 'this-week'
    | 'last-week'
    | 'this-month'
    | 'last-month'
    | 'this-year'
    | 'last-year'
    | 'last-7-days'
    | 'last-30-days'
    | 'last-90-days'
    | 'all-time'
    | 'custom';

/**
 * Date filtering utilities
 */
export class DateFilters {
    /**
     * Get start of day (00:00:00)
     */
    static startOfDay(date: Date): Date {
        const result = new Date(date);
        result.setHours(0, 0, 0, 0);
        return result;
    }

    /**
     * Get end of day (23:59:59.999)
     */
    static endOfDay(date: Date): Date {
        const result = new Date(date);
        result.setHours(23, 59, 59, 999);
        return result;
    }

    /**
     * Get start of week (Monday 00:00:00)
     */
    static startOfWeek(date: Date, startOnMonday: boolean = true): Date {
        const result = new Date(date);
        const day = result.getDay();
        const diff = startOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
        result.setDate(result.getDate() + diff);
        return this.startOfDay(result);
    }

    /**
     * Get end of week (Sunday 23:59:59)
     */
    static endOfWeek(date: Date, startOnMonday: boolean = true): Date {
        const result = new Date(date);
        const day = result.getDay();
        const diff = startOnMonday ? (day === 0 ? 0 : 7 - day) : 6 - day;
        result.setDate(result.getDate() + diff);
        return this.endOfDay(result);
    }

    /**
     * Get start of month (1st day 00:00:00)
     */
    static startOfMonth(date: Date): Date {
        return this.startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
    }

    /**
     * Get end of month (last day 23:59:59)
     */
    static endOfMonth(date: Date): Date {
        return this.endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    }

    /**
     * Get start of year (Jan 1 00:00:00)
     */
    static startOfYear(date: Date): Date {
        return this.startOfDay(new Date(date.getFullYear(), 0, 1));
    }

    /**
     * Get end of year (Dec 31 23:59:59)
     */
    static endOfYear(date: Date): Date {
        return this.endOfDay(new Date(date.getFullYear(), 11, 31));
    }

    /**
     * Get date range for "today"
     */
    static getToday(): DateRange {
        const now = new Date();
        return {
            start: this.startOfDay(now),
            end: this.endOfDay(now),
        };
    }

    /**
     * Get date range for "yesterday"
     */
    static getYesterday(): DateRange {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return {
            start: this.startOfDay(yesterday),
            end: this.endOfDay(yesterday),
        };
    }

    /**
     * Get date range for "this week"
     */
    static getThisWeek(startOnMonday: boolean = true): DateRange {
        const now = new Date();
        return {
            start: this.startOfWeek(now, startOnMonday),
            end: this.endOfWeek(now, startOnMonday),
        };
    }

    /**
     * Get date range for "last week"
     */
    static getLastWeek(startOnMonday: boolean = true): DateRange {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        return {
            start: this.startOfWeek(lastWeek, startOnMonday),
            end: this.endOfWeek(lastWeek, startOnMonday),
        };
    }

    /**
     * Get date range for "this month"
     */
    static getThisMonth(): DateRange {
        const now = new Date();
        return {
            start: this.startOfMonth(now),
            end: this.endOfMonth(now),
        };
    }

    /**
     * Get date range for "last month"
     */
    static getLastMonth(): DateRange {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        return {
            start: this.startOfMonth(lastMonth),
            end: this.endOfMonth(lastMonth),
        };
    }

    /**
     * Get date range for "this year"
     */
    static getThisYear(): DateRange {
        const now = new Date();
        return {
            start: this.startOfYear(now),
            end: this.endOfYear(now),
        };
    }

    /**
     * Get date range for "last year"
     */
    static getLastYear(): DateRange {
        const lastYear = new Date();
        lastYear.setFullYear(lastYear.getFullYear() - 1);
        return {
            start: this.startOfYear(lastYear),
            end: this.endOfYear(lastYear),
        };
    }

    /**
     * Get date range for "last N days"
     */
    static getLastNDays(days: number): DateRange {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - days + 1);
        return {
            start: this.startOfDay(start),
            end: this.endOfDay(now),
        };
    }

    /**
     * Get date range for "all time"
     */
    static getAllTime(): DateRange {
        return {
            start: new Date(1970, 0, 1),
            end: new Date(2099, 11, 31),
        };
    }

    /**
     * Get date range by preset
     */
    static getRangeByPreset(preset: DateFilterPreset, customRange?: DateRange): DateRange {
        switch (preset) {
            case 'today':
                return this.getToday();
            case 'yesterday':
                return this.getYesterday();
            case 'this-week':
                return this.getThisWeek();
            case 'last-week':
                return this.getLastWeek();
            case 'this-month':
                return this.getThisMonth();
            case 'last-month':
                return this.getLastMonth();
            case 'this-year':
                return this.getThisYear();
            case 'last-year':
                return this.getLastYear();
            case 'last-7-days':
                return this.getLastNDays(7);
            case 'last-30-days':
                return this.getLastNDays(30);
            case 'last-90-days':
                return this.getLastNDays(90);
            case 'all-time':
                return this.getAllTime();
            case 'custom':
                return customRange || this.getAllTime();
            default:
                return this.getAllTime();
        }
    }

    /**
     * Check if a date is today
     */
    static isToday(date: Date | string): boolean {
        const checkDate = typeof date === 'string' ? new Date(date) : date;
        const today = new Date();
        return checkDate.toDateString() === today.toDateString();
    }

    /**
     * Check if a date is in this week
     */
    static isThisWeek(date: Date | string): boolean {
        const checkDate = typeof date === 'string' ? new Date(date) : date;
        const range = this.getThisWeek();
        return checkDate >= range.start && checkDate <= range.end;
    }

    /**
     * Check if a date is in this month
     */
    static isThisMonth(date: Date | string): boolean {
        const checkDate = typeof date === 'string' ? new Date(date) : date;
        const today = new Date();
        return (
            checkDate.getMonth() === today.getMonth() &&
            checkDate.getFullYear() === today.getFullYear()
        );
    }

    /**
     * Check if a date is in the last N days
     */
    static isInLastDays(date: Date | string, days: number): boolean {
        const checkDate = typeof date === 'string' ? new Date(date) : date;
        const range = this.getLastNDays(days);
        return checkDate >= range.start && checkDate <= range.end;
    }

    /**
     * Check if a date is in a date range
     */
    static isInRange(date: Date | string, range: DateRange): boolean {
        const checkDate = typeof date === 'string' ? new Date(date) : date;
        return checkDate >= range.start && checkDate <= range.end;
    }

    /**
     * Format date range for display
     */
    static formatRange(range: DateRange): string {
        const formatDate = (date: Date): string => {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        };

        return `${formatDate(range.start)} - ${formatDate(range.end)}`;
    }

    /**
     * Get number of days in a range
     */
    static getDaysInRange(range: DateRange): number {
        const msPerDay = 24 * 60 * 60 * 1000;
        return Math.round((range.end.getTime() - range.start.getTime()) / msPerDay) + 1;
    }

    /**
     * Check if two date ranges overlap
     */
    static rangesOverlap(range1: DateRange, range2: DateRange): boolean {
        return range1.start <= range2.end && range2.start <= range1.end;
    }
}
