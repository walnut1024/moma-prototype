export const API_PREFIX = '/api/v1';

export const isApiPath = pathname => pathname === API_PREFIX || pathname.startsWith(API_PREFIX + '/');
