'use strict';

(function exposeNumberFormatter() {

    const locale = 'en-US';

    const amountFormatter =
        new Intl.NumberFormat(
            locale,
            {
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
                useGrouping: false
            }
        );

    const usdFormatter =
        new Intl.NumberFormat(
            locale,
            {
                style: 'currency',
                currency: 'USD',
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
                useGrouping: false
            }
        );

    const priceFormatter =
        new Intl.NumberFormat(
            locale,
            {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
                useGrouping: true
            }
        );

    const regularAmountFormatter =
        new Intl.NumberFormat(
            locale,
            {
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
                useGrouping: false
            }
        );

    function normalize(value) {

        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return 0;
        }

        if (
            typeof value === 'bigint'
        ) {
            return value;
        }

        if (
            typeof value === 'number'
        ) {
            return Number.isFinite(value)
                ? value
                : 0;
        }

        const normalized =
            String(value)
                .trim()
                .replace(/,/g, '')
                .replace(/^\$/, '');

        if (!normalized) {
            return 0;
        }

        /*
         * Preserve integer strings exactly
         * when possible.
         */
        if (
            /^-?\d+$/.test(normalized)
        ) {
            try {
                return BigInt(normalized);
            } catch {
                // Fall through to Number.
            }
        }

        const number =
            Number(normalized);

        return Number.isFinite(number)
            ? number
            : 0;
    }

    function formatAmount(value) {

        const normalized =
            normalize(value);

        return amountFormatter.format(
            normalized
        );
    }

    function formatUsd(value) {

        const normalized =
            normalize(value);

        return usdFormatter.format(
            normalized
        );
    }

    function formatPrice(value) {

        const normalized =
            normalize(value);

        return priceFormatter.format(
            normalized
        );
    }

    function formatRegular(value) {

        const normalized =
            normalize(value);

        return regularAmountFormatter.format(
            normalized
        );
    }

    function formatInteger(value) {

        const normalized =
            normalize(value);

        if (
            typeof normalized === 'bigint'
        ) {
            return normalized.toLocaleString(
                locale
            );
        }

        if (
            !Number.isFinite(normalized)
        ) {
            return '0';
        }

        return Math.trunc(
            normalized
        ).toLocaleString(
            locale,
            {
                useGrouping: true,
                maximumFractionDigits: 0
            }
        );
    }

    window.HollldNumberFormatter = {
        amount: formatAmount,
        usd: formatUsd,
        price: formatPrice,
        regular: formatRegular,
        integer: formatInteger
    };

})();