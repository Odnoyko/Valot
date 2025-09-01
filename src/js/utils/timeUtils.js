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
}