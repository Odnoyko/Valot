export class TimeUtils {
    /**
     * Format seconds to HH:MM:SS
     */
    static formatDuration(seconds: number): string {
        if (!seconds) return '00:00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format date to localized string
     */
    static formatDate(dateString: string, locale: string = 'de-DE'): string {
        return new Date(dateString).toLocaleDateString(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /**
     * Format date and time for editing (DD/MM/YYYY HH:MM:SS)
     */
    static formatDateTimeForEdit(dateString: string): string {
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
    static parseEuropeanDateTime(dateTimeString: string): string | null {
        if (!dateTimeString) return null;

        const parts = dateTimeString.split(' ');
        if (parts.length !== 2) return dateTimeString;

        const [datePart, timePart] = parts;
        const [day, month, year] = datePart.split('/');

        if (!day || !month || !year) return dateTimeString;

        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`;
    }

    /**
     * Calculate duration in seconds between two timestamps
     */
    static calculateDuration(startTime: string, endTime: string): number {
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
    static getCurrentWeekRange(): { startOfWeek: Date; endOfWeek: Date } {
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
    static getCurrentTimestamp(): string {
        return new Date().toISOString();
    }

    /**
     * Check if date is today
     */
    static isToday(dateString: string): boolean {
        const date = new Date(dateString);
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }

    /**
     * Calculate percentage of time spent compared to target
     */
    static calculateTimePercentage(actual: number, target: number): number {
        if (target === 0) return 0;
        return Math.min(100, Math.round((actual / target) * 100));
    }
}
