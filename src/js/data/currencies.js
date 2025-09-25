/**
 * Currency data for international support
 */
export function getCurrencySymbol(currencyCode) {
    const currencyMap = {
        // Major currencies
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'CNY': '¥',
        'RUB': '₽',
        'CAD': 'C$',
        'AUD': 'A$',
        'CHF': 'CHF',
        'SEK': 'kr',
        'NOK': 'kr',
        'DKK': 'kr',
        
        // European currencies
        'PLN': 'zł',
        'CZK': 'Kč',
        'HUF': 'Ft',
        'RON': 'lei',
        'BGN': 'лв',
        'HRK': 'kn',
        
        // Other currencies
        'INR': '₹',
        'KRW': '₩',
        'BRL': 'R$',
        'MXN': '$',
        'ZAR': 'R',
        'TRY': '₺',
        'UAH': '₴',
        
        // Crypto currencies
        'BTC': '₿',
        'ETH': 'Ξ',
        'LTC': 'Ł'
    };
    
    return currencyMap[currencyCode] || currencyCode;
}

export function getAllCurrencies() {
    return [
        { code: 'USD', symbol: '$', name: 'US Dollar' },
        { code: 'EUR', symbol: '€', name: 'Euro' },
        { code: 'GBP', symbol: '£', name: 'British Pound' },
        { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
        { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
        { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
        { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
        { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
        { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
        { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
        { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
        { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
        { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
        { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
        { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
        { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
        { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
        { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
        { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
        { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
        { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
        { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
        { code: 'BTC', symbol: '₿', name: 'Bitcoin' },
        { code: 'ETH', symbol: 'Ξ', name: 'Ethereum' },
        { code: 'LTC', symbol: 'Ł', name: 'Litecoin' }
    ];
}

export function formatCurrency(amount, currencyCode, locale = 'en-US') {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currencyCode
        }).format(amount);
    } catch (error) {
        // Fallback for unsupported currencies
        const symbol = getCurrencySymbol(currencyCode);
        return `${symbol}${amount.toFixed(2)}`;
    }
}