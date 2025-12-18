// Because Firefox has issues with popovers inside portals

/** Attempts to determine if a user is using Firefox using `navigator.userAgent`. */
export const isFirefox =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('Firefox') &&
    !navigator.userAgent.includes('Seamonkey');
