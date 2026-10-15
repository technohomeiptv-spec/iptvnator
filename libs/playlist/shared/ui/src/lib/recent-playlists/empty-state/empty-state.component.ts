import {
    Component,
    ChangeDetectionStrategy,
    computed,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { PlaylistType } from '../../add-playlist-menu/playlist-type';

export type EmptyStateType =
    'welcome-dashboard' | 'welcome-sources' | 'no-results' | 'no-data';

type TechHomeLang = 'ar' | 'en';

interface WelcomeCard {
    icon: string;
    title: string;
    desc: string;
}

interface WelcomeStrings {
    title: string;
    tagline: string;
    description: string;
    signIn: string;
    whatsapp: string;
    website: string;
    switchLang: string;
    sourcesTitle: string;
    sourcesBody: string;
    cards: readonly WelcomeCard[];
}

const WELCOME_STRINGS: Record<TechHomeLang, WelcomeStrings> = {
    ar: {
        title: 'مرحباً بك في Tech Home TV',
        tagline: 'كل ما تحب مشاهدته في مكان واحد',
        description:
            'سجّل الدخول بحساب اشتراكك لتشاهد القنوات المباشرة والأفلام والمسلسلات بجودة عالية.',
        signIn: 'تسجيل الدخول',
        whatsapp: 'تواصل عبر واتساب',
        website: 'الموقع الرسمي',
        switchLang: 'English',
        sourcesTitle: 'سجّل الدخول لتبدأ المشاهدة',
        sourcesBody:
            'أدخل اسم المستخدم وكلمة المرور الخاصين باشتراكك، وسيختار التطبيق السيرفر المناسب تلقائياً.',
        cards: [
            {
                icon: 'live_tv',
                title: 'قنوات مباشرة',
                desc: 'شاهد قنواتك المفضلة بثاً مباشراً.',
            },
            {
                icon: 'movie',
                title: 'أفلام ومسلسلات',
                desc: 'مكتبة تشاهدها وقتما تشاء.',
            },
            {
                icon: 'support_agent',
                title: 'دعم مباشر',
                desc: 'فريقنا جاهز لمساعدتك عبر واتساب.',
            },
        ],
    },
    en: {
        title: 'Welcome to Tech Home TV',
        tagline: 'Everything you love to watch, in one place',
        description:
            'Sign in with your subscription account to watch live channels, movies and series in high quality.',
        signIn: 'Sign in',
        whatsapp: 'Contact us on WhatsApp',
        website: 'Official website',
        switchLang: 'العربية',
        sourcesTitle: 'Sign in to start watching',
        sourcesBody:
            'Enter your subscription username and password and the app will pick the right server automatically.',
        cards: [
            {
                icon: 'live_tv',
                title: 'Live channels',
                desc: 'Watch your favourite channels live.',
            },
            {
                icon: 'movie',
                title: 'Movies & series',
                desc: 'A library you can watch any time.',
            },
            {
                icon: 'support_agent',
                title: 'Direct support',
                desc: 'Our team is ready to help on WhatsApp.',
            },
        ],
    },
};

/** Same hint key the application uses to remember the chosen language. */
const PREFERRED_LANG_KEY = 'iptvnator:preferred-language';
/** Written by the sign-in screen after it loads the remote configuration. */
const CONFIG_CACHE_KEY = 'techhome.config.v1';
const CONFIG_URL =
    'https://raw.githubusercontent.com/technohomeiptv-spec/techhome-config/main/servers.json';

interface ContactLinks {
    whatsapp: string;
    website: string;
}

const FALLBACK_LINKS: ContactLinks = {
    whatsapp: 'https://wa.me/9647744644492',
    website: 'https://techhome.ct.ws/',
};

function isHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

function pickLinks(raw: unknown): ContactLinks | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const links = (raw as Record<string, unknown>)['links'];
    if (!links || typeof links !== 'object') {
        return null;
    }
    const record = links as Record<string, unknown>;
    return {
        whatsapp: isHttpUrl(record['whatsapp'])
            ? record['whatsapp'].trim()
            : FALLBACK_LINKS.whatsapp,
        website: isHttpUrl(record['website'])
            ? record['website'].trim()
            : FALLBACK_LINKS.website,
    };
}

function readCachedLinks(): ContactLinks {
    try {
        const text = localStorage.getItem(CONFIG_CACHE_KEY);
        return (text ? pickLinks(JSON.parse(text)) : null) ?? FALLBACK_LINKS;
    } catch {
        return FALLBACK_LINKS;
    }
}

function toTechHomeLang(code: string | null | undefined): TechHomeLang {
    return !code || code.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function readInitialLang(): TechHomeLang {
    try {
        return toTechHomeLang(localStorage.getItem(PREFERRED_LANG_KEY));
    } catch {
        return 'ar';
    }
}

@Component({
    selector: 'app-empty-state',
    templateUrl: './empty-state.component.html',
    styleUrls: [
        './empty-state.component.scss',
        './empty-state.welcome-dashboard.scss',
        './empty-state.welcome-sources.scss',
        './empty-state.responsive.scss',
    ],
    styles: [
        `
            .th-welcome {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: 8px;
                width: 100%;
                max-width: 760px;
                margin: 0 auto;
                padding: 24px 16px;
                box-sizing: border-box;
            }

            .th-logo {
                display: block;
                width: min(320px, 80%);
                height: auto;
                margin: 0 auto 8px;
            }

            .th-title {
                margin: 0;
                font-size: 28px;
                font-weight: 600;
            }

            .th-tagline {
                margin: 0;
                font-size: 17px;
                opacity: 0.85;
            }

            .th-desc {
                margin: 4px 0 8px;
                max-width: 520px;
                line-height: 1.7;
                opacity: 0.75;
            }

            .th-cta {
                margin-top: 8px;
                min-width: 220px;
                height: 48px;
                font-size: 16px;
                border-radius: 999px;
            }

            .th-actions {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 10px;
                width: 100%;
                max-width: 440px;
                margin-top: 12px;
            }

            .th-btn {
                flex: 1 1 170px;
                min-width: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 14px;
                border-radius: 999px;
                font-weight: 500;
                font-size: 14px;
                line-height: 1.2;
                text-decoration: none;
                color: inherit;
                border: 1px solid currentColor;
                cursor: pointer;
                transition: opacity 0.15s ease;
            }

            .th-btn:hover {
                opacity: 0.85;
            }

            .th-btn mat-icon {
                width: 20px;
                height: 20px;
                font-size: 20px;
                flex: none;
            }

            .th-btn--whatsapp {
                background: #25d366;
                border-color: #25d366;
                color: #fff;
            }

            .th-cards {
                list-style: none;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
                gap: 12px;
                width: 100%;
                margin: 20px 0 0;
                padding: 0;
            }

            .th-card {
                padding: 16px 12px;
                border-radius: 16px;
                background: rgba(128, 128, 128, 0.1);
                border: 1px solid rgba(128, 128, 128, 0.2);
            }

            .th-card mat-icon {
                width: 32px;
                height: 32px;
                font-size: 32px;
                margin-bottom: 6px;
            }

            .th-card h3 {
                margin: 0 0 4px;
                font-size: 16px;
                font-weight: 600;
            }

            .th-card p {
                margin: 0;
                font-size: 13px;
                opacity: 0.75;
                line-height: 1.5;
            }

            .th-lang {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-top: 16px;
                padding: 6px 12px;
                background: transparent;
                border: none;
                border-radius: 999px;
                color: inherit;
                font: inherit;
                font-size: 13px;
                opacity: 0.8;
                cursor: pointer;
            }

            .th-lang:hover {
                opacity: 1;
                background: rgba(128, 128, 128, 0.15);
            }

            .th-lang mat-icon {
                width: 18px;
                height: 18px;
                font-size: 18px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule, MatIcon, TranslatePipe],
})
export class EmptyStateComponent {
    readonly type = input.required<EmptyStateType>();

    readonly icon = input<string>('inbox');
    readonly titleKey = input<string>('');
    readonly descriptionKey = input<string>('');
    readonly primaryActionLabelKey = input<string | null>(null);
    readonly secondaryActionLabelKey = input<string | null>(null);

    readonly showElectronOnlyValueProps = input<boolean>(false);

    readonly addPlaylistClicked = output<PlaylistType | undefined>();
    readonly primaryActionClicked = output<void>();
    readonly secondaryActionClicked = output<void>();

    private readonly translate = inject(TranslateService);

    /** Follows the application language. */
    readonly lang = signal<TechHomeLang>(readInitialLang());
    readonly t = computed(() => WELCOME_STRINGS[this.lang()]);
    readonly links = signal<ContactLinks>(readCachedLinks());

    constructor() {
        this.translate.onLangChange
            .pipe(takeUntilDestroyed())
            .subscribe((event: { lang: string }) =>
                this.lang.set(toTechHomeLang(event.lang))
            );
        void this.refreshLinks();
    }

    onAddPlaylist(type?: PlaylistType): void {
        this.addPlaylistClicked.emit(type);
    }

    onPrimaryAction(): void {
        this.primaryActionClicked.emit();
    }

    onSecondaryAction(): void {
        this.secondaryActionClicked.emit();
    }

    /** Switches the whole application between Arabic and English. */
    toggleLang(): void {
        const next: TechHomeLang = this.lang() === 'ar' ? 'en' : 'ar';
        try {
            localStorage.setItem(PREFERRED_LANG_KEY, next);
        } catch {
            // storage unavailable - ignore
        }
        this.lang.set(next);
        this.translate.use(next);
    }

    /** Reads the contact links from the remote file; keeps cached ones on failure. */
    private async refreshLinks(): Promise<void> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(`${CONFIG_URL}?t=${Date.now()}`, {
                signal: controller.signal,
                cache: 'no-store',
            });
            if (response.ok) {
                const links = pickLinks(await response.json());
                if (links) {
                    this.links.set(links);
                }
            }
        } catch {
            // offline or blocked - keep what we have
        } finally {
            clearTimeout(timer);
        }
    }
}
