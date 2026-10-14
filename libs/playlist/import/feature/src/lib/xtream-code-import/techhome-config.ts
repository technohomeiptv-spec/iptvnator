/**
 * Tech Home TV - remote server configuration.
 *
 * The package/server list is read at runtime from a JSON file hosted on
 * GitHub, so servers can be added, edited or removed without rebuilding the
 * app. If the file cannot be fetched, the last good copy (localStorage) or the
 * embedded fallback below is used.
 */

export interface TechHomePackage {
    name: string;
    enabled?: boolean;
    servers: string[];
}

export interface TechHomeConfig {
    version?: number;
    appName?: string;
    links?: {
        whatsapp?: string;
        website?: string;
    };
    packages: TechHomePackage[];
}

export const TECHHOME_APP_TITLE = 'Tech Home TV';

export const TECHHOME_CONFIG_URL =
    'https://raw.githubusercontent.com/technohomeiptv-spec/techhome-config/main/servers.json';

const CONFIG_CACHE_KEY = 'techhome.config.v1';
const LAST_SERVER_KEY_PREFIX = 'techhome.lastServer.';
const FETCH_TIMEOUT_MS = 5000;

/** Embedded copy used when the remote file is unreachable. */
export const TECHHOME_FALLBACK_CONFIG: TechHomeConfig = {
    version: 1,
    appName: TECHHOME_APP_TITLE,
    links: {
        whatsapp: 'https://wa.me/9647744644492',
        website: 'https://techhome.ct.ws/',
    },
    packages: [
        {
            name: 'Gold',
            servers: [
                'http://nawrs4k.sbs',
                'http://techhome.sbs',
                'http://cf.business-cloud-4.ru',
            ],
        },
        {
            name: 'Basic',
            servers: ['http://lyvanta.store:80', 'http://s8khosting.com:80'],
        },
        {
            name: 'Silver',
            servers: [
                'http://techhome.cfd',
                'http://king-km-king.org',
                'http://ott.km4ever.org',
            ],
        },
        {
            name: 'Silver 2',
            servers: ['http://ktvs.xyz:8080', 'http://oxyking.xyz'],
        },
        {
            name: 'Platinum',
            servers: ['http://cf.business-cloud-8.ru'],
        },
    ],
};

function isHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

/** Validates untrusted JSON; returns null when nothing usable is inside. */
function sanitizeConfig(raw: unknown): TechHomeConfig | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const source = raw as Record<string, unknown>;
    if (!Array.isArray(source['packages'])) {
        return null;
    }

    const packages: TechHomePackage[] = [];
    for (const item of source['packages']) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const pkg = item as Record<string, unknown>;
        if (pkg['enabled'] === false || !Array.isArray(pkg['servers'])) {
            continue;
        }
        const servers = (pkg['servers'] as unknown[])
            .filter(isHttpUrl)
            .map((url) => url.trim());
        if (servers.length === 0) {
            continue;
        }
        packages.push({
            name: typeof pkg['name'] === 'string' ? pkg['name'] : 'Package',
            servers,
        });
    }

    if (packages.length === 0) {
        return null;
    }

    const links = (source['links'] ?? {}) as Record<string, unknown>;

    return {
        version:
            typeof source['version'] === 'number'
                ? source['version']
                : undefined,
        appName:
            typeof source['appName'] === 'string' && source['appName'].trim()
                ? source['appName'].trim()
                : TECHHOME_APP_TITLE,
        links: {
            whatsapp: isHttpUrl(links['whatsapp'])
                ? links['whatsapp'].trim()
                : TECHHOME_FALLBACK_CONFIG.links?.whatsapp,
            website: isHttpUrl(links['website'])
                ? links['website'].trim()
                : TECHHOME_FALLBACK_CONFIG.links?.website,
        },
        packages,
    };
}

function readCachedConfig(): TechHomeConfig | null {
    try {
        const text = localStorage.getItem(CONFIG_CACHE_KEY);
        return text ? sanitizeConfig(JSON.parse(text)) : null;
    } catch {
        return null;
    }
}

/**
 * Remote file first, then the last cached copy, then the embedded fallback.
 * Never throws.
 */
export async function loadTechHomeConfig(): Promise<TechHomeConfig> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(
            `${TECHHOME_CONFIG_URL}?t=${Date.now()}`,
            { signal: controller.signal, cache: 'no-store' }
        );
        if (response.ok) {
            const parsed = sanitizeConfig(await response.json());
            if (parsed) {
                try {
                    localStorage.setItem(
                        CONFIG_CACHE_KEY,
                        JSON.stringify(parsed)
                    );
                } catch {
                    // storage unavailable - ignore
                }
                return parsed;
            }
        }
    } catch {
        // offline, blocked or timed out - fall through
    } finally {
        clearTimeout(timer);
    }

    return readCachedConfig() ?? TECHHOME_FALLBACK_CONFIG;
}

/** All server URLs in package order, without duplicates. */
export function collectServers(config: TechHomeConfig): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const pkg of config.packages) {
        for (const url of pkg.servers) {
            const key = url.replace(/\/+$/, '').toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                result.push(url);
            }
        }
    }
    return result;
}

export function readRememberedServer(username: string): string | null {
    try {
        return localStorage.getItem(
            LAST_SERVER_KEY_PREFIX + username.toLowerCase()
        );
    } catch {
        return null;
    }
}

export function rememberServer(username: string, serverUrl: string): void {
    try {
        localStorage.setItem(
            LAST_SERVER_KEY_PREFIX + username.toLowerCase(),
            serverUrl
        );
    } catch {
        // storage unavailable - ignore
    }
}
