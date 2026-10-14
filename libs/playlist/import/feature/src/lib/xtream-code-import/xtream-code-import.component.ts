import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Output,
    computed,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { PlaylistActions } from '@iptvnator/m3u-state';
import {
    createXtreamConnectionTestState,
    XtreamConnectionTestService,
} from '@iptvnator/services';
import { PasswordVisibilityToggleDirective } from '@iptvnator/ui/components/password-visibility-toggle';
import { createRandomId, Playlist } from '@iptvnator/shared/interfaces';
import { provideFormFieldDefaults } from '@iptvnator/ui/components/form-field-defaults';
import {
    TECHHOME_APP_TITLE,
    TECHHOME_FALLBACK_CONFIG,
    TechHomeConfig,
    collectServers,
    loadTechHomeConfig,
    readRememberedServer,
    rememberServer,
} from './techhome-config';

type TechHomeLang = 'ar' | 'en';

/** Same hint key the app itself uses to remember the chosen language. */
const PREFERRED_LANG_KEY = 'iptvnator:preferred-language';

const STRINGS: Record<TechHomeLang, Record<string, string>> = {
    ar: {
        welcome: 'مرحباً بك في Tech Home TV',
        hint: 'أدخل بيانات اشتراكك لتسجيل الدخول',
        username: 'اسم المستخدم',
        password: 'كلمة المرور',
        showPassword: 'إظهار كلمة المرور',
        checking: 'جارٍ التحقق من الاشتراك...',
        failed: 'تعذّر تسجيل الدخول. تأكد من اسم المستخدم وكلمة المرور وحاول مرة أخرى، أو تواصل معنا.',
        inactive: 'الاشتراك غير فعّال أو منتهي. تواصل معنا للتجديد.',
        whatsapp: 'تواصل عبر واتساب',
        website: 'الموقع الرسمي',
        switchLang: 'English',
    },
    en: {
        welcome: 'Welcome to Tech Home TV',
        hint: 'Enter your subscription details to sign in',
        username: 'Username',
        password: 'Password',
        showPassword: 'Show password',
        checking: 'Verifying your subscription...',
        failed: 'Sign-in failed. Check your username and password and try again, or contact us.',
        inactive: 'Your subscription is inactive or expired. Contact us to renew.',
        whatsapp: 'Contact us on WhatsApp',
        website: 'Official website',
        switchLang: 'العربية',
    },
};

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

interface ProbeOutcome {
    serverUrl: string | null;
    /** True when a server recognised the account but it is not active. */
    inactive: boolean;
}

@Component({
    imports: [
        FormsModule,
        MatFormFieldModule,
        MatIcon,
        MatIconButton,
        MatInputModule,
        PasswordVisibilityToggleDirective,
        ReactiveFormsModule,
    ],
    selector: 'app-xtream-code-import',
    providers: [provideFormFieldDefaults()],
    templateUrl: './xtream-code-import.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
            :host {
                display: flex;
                margin: 10px;
                justify-content: center;
            }

            .th-login {
                width: 100%;
                max-width: 420px;
                text-align: center;
            }

            .th-logo {
                display: block;
                max-width: 260px;
                width: 70%;
                height: auto;
                margin: 4px auto 12px;
            }

            .th-login h2 {
                margin: 0 0 4px;
            }

            .th-hint {
                margin: 0 0 16px;
                opacity: 0.75;
            }

            form {
                width: 100%;
                text-align: start;
            }

            .th-status {
                margin: 8px 0;
                text-align: center;
                opacity: 0.85;
            }

            .th-error {
                margin: 8px 0;
                text-align: center;
                color: #ff5252;
            }

            .th-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 14px;
            }

            .th-btn {
                flex: 1 1 150px;
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

            .th-lang {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-top: 14px;
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
})
export class XtreamCodeImportComponent {
    @Output() addClicked = new EventEmitter<void>();

    /**
     * Same shape as the original form so the add-playlist dialog bindings
     * keep working. Title and server URL are filled automatically; only the
     * username and password are entered by the subscriber.
     */
    form = new FormGroup({
        _id: new FormControl(createRandomId()),
        title: new FormControl(TECHHOME_APP_TITLE),
        password: new FormControl('', [Validators.required]),
        username: new FormControl('', [Validators.required]),
        serverUrl: new FormControl(
            TECHHOME_FALLBACK_CONFIG.packages[0]?.servers[0] ?? ''
        ),
        importDate: new FormControl(new Date().toISOString()),
    });

    readonly store = inject(Store);
    readonly connectionTest = createXtreamConnectionTestState(this.form);
    private readonly connectionService = inject(XtreamConnectionTestService);
    private readonly translate = inject(TranslateService);
    private readonly passwordToggle = viewChild(
        PasswordVisibilityToggleDirective
    );

    /** Follows the application language, so direction and fields stay in step. */
    readonly lang = signal<TechHomeLang>(readInitialLang());
    readonly t = computed(() => STRINGS[this.lang()]);
    readonly busy = signal(false);
    readonly error = signal('');
    readonly config = signal<TechHomeConfig>(TECHHOME_FALLBACK_CONFIG);
    readonly links = computed(() => ({
        whatsapp:
            this.config().links?.whatsapp ??
            TECHHOME_FALLBACK_CONFIG.links?.whatsapp ??
            '',
        website:
            this.config().links?.website ??
            TECHHOME_FALLBACK_CONFIG.links?.website ??
            '',
    }));

    constructor() {
        void loadTechHomeConfig().then((config) => this.config.set(config));
        this.translate.onLangChange
            .pipe(takeUntilDestroyed())
            .subscribe((event: { lang: string }) =>
                this.lang.set(toTechHomeLang(event.lang))
            );
    }

    get isTestingConnection(): boolean {
        return this.busy() || this.connectionTest.testing();
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

    /** Kept for compatibility: checks the credentials without saving. */
    async testConnection(_allowHttpFallback = false): Promise<void> {
        await this.authenticate();
    }

    clearForm(): void {
        // A cleared form is a fresh entry: the next password starts masked.
        this.passwordToggle()?.hide();
        this.error.set('');
        this.form.reset({
            _id: createRandomId(),
            title: TECHHOME_APP_TITLE,
            password: '',
            username: '',
            serverUrl: this.form.value.serverUrl ?? '',
            importDate: new Date().toISOString(),
        });
    }

    async addPlaylist(): Promise<void> {
        const login = await this.authenticate();
        if (!login) {
            return;
        }

        this.store.dispatch(
            PlaylistActions.addPlaylist({
                playlist: {
                    ...this.form.value,
                    title: login.title,
                    username: login.username,
                    password: login.password,
                    serverUrl: login.serverUrl,
                } as Playlist,
            })
        );
        this.addClicked.emit();
    }

    /**
     * Tries the remembered server first, then every configured server in
     * parallel. The first one that accepts the credentials wins.
     */
    private async authenticate(): Promise<{
        username: string;
        password: string;
        serverUrl: string;
        title: string;
    } | null> {
        if (!this.form.valid || this.busy()) {
            return null;
        }

        const username = (this.form.value.username ?? '').trim();
        const password = (this.form.value.password ?? '').trim();
        if (!username || !password) {
            return null;
        }

        this.busy.set(true);
        this.error.set('');

        try {
            const config = await loadTechHomeConfig();
            this.config.set(config);

            const outcome = await this.findWorkingServer(
                username,
                password,
                collectServers(config)
            );

            if (!outcome.serverUrl) {
                this.error.set(
                    outcome.inactive
                        ? this.t()['inactive']
                        : this.t()['failed']
                );
                return null;
            }

            rememberServer(username, outcome.serverUrl);

            return {
                username,
                password,
                serverUrl: outcome.serverUrl,
                title: config.appName || TECHHOME_APP_TITLE,
            };
        } finally {
            this.busy.set(false);
        }
    }

    private async findWorkingServer(
        username: string,
        password: string,
        servers: string[]
    ): Promise<ProbeOutcome> {
        let inactive = false;

        const probe = async (serverUrl: string): Promise<string | null> => {
            try {
                const result = await this.connectionService.test(
                    { serverUrl, username, password },
                    () => true,
                    true
                );
                if (result.status === 'active') {
                    return result.serverUrl;
                }
                if (result.status !== 'unavailable') {
                    inactive = true;
                }
            } catch {
                // unreachable server - try the next one
            }
            return null;
        };

        const remembered = readRememberedServer(username);
        if (remembered && servers.includes(remembered)) {
            const hit = await probe(remembered);
            if (hit) {
                return { serverUrl: hit, inactive };
            }
        }

        const rest = servers.filter((url) => url !== remembered);
        if (rest.length === 0) {
            return { serverUrl: null, inactive };
        }

        const winner = await new Promise<string | null>((resolve) => {
            let pending = rest.length;
            let settled = false;
            for (const url of rest) {
                void probe(url).then((hit) => {
                    if (settled) {
                        return;
                    }
                    if (hit) {
                        settled = true;
                        resolve(hit);
                        return;
                    }
                    pending -= 1;
                    if (pending === 0) {
                        resolve(null);
                    }
                });
            }
        });

        return { serverUrl: winner, inactive: winner ? false : inactive };
    }
}
