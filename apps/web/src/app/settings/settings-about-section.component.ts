import {
    Component,
    computed,
    inject,
    input,
    output,
    signal,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
    AppUpdateChannel,
    APP_UPDATE_CHANNELS,
    ELECTRON_BRIDGE_APP_UPDATE_STATUSES,
    ElectronBridgeAppUpdateStatus,
} from '@iptvnator/shared/interfaces';
import { UpdateChannelOption } from './settings.models';
import { markSectionForCheckOnFormEvents } from './settings-section-form-render';
import { provideFormFieldDefaults } from '@iptvnator/ui/components/form-field-defaults';

interface SettingsUpdateStatusChip {
    readonly labelKey: string;
    readonly tone: 'accent' | 'success' | 'warn' | 'neutral';
}

type TechHomeLang = 'ar' | 'en';

interface AboutStrings {
    subtitle: string;
    tagline: string;
    contactTitle: string;
    whatsapp: string;
    whatsappDesc: string;
    website: string;
    websiteDesc: string;
    credits: string;
}

const ABOUT_STRINGS: Record<TechHomeLang, AboutStrings> = {
    ar: {
        subtitle: 'معلومات التطبيق وطرق التواصل معنا',
        tagline: 'كل ما تحب مشاهدته في مكان واحد',
        contactTitle: 'تواصل معنا',
        whatsapp: 'واتساب',
        whatsappDesc: 'تحدث مع فريق الدعم مباشرة',
        website: 'الموقع الرسمي',
        websiteDesc: 'زر موقعنا الرسمي',
        credits:
            'مبني على IPTVnator، وهو مشروع مفتوح المصدر برخصة MIT.',
    },
    en: {
        subtitle: 'App information and ways to reach us',
        tagline: 'Everything you love to watch, in one place',
        contactTitle: 'Contact us',
        whatsapp: 'WhatsApp',
        whatsappDesc: 'Chat with our support team',
        website: 'Official website',
        websiteDesc: 'Visit our official website',
        credits:
            'Built on IPTVnator, an open-source project licensed under MIT.',
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
    selector: 'app-settings-about-section',
    providers: [provideFormFieldDefaults()],
    imports: [
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatSelectModule,
        ReactiveFormsModule,
        TranslateModule,
    ],
    templateUrl: './settings-about-section.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrls: ['./settings-about-section.component.scss'],
    styles: [
        `
            .link-card--whatsapp .link-card__glyph {
                color: #25d366;
            }

            .th-credits {
                margin: 14px 0 0;
                text-align: center;
                font-size: 12px;
                opacity: 0.6;
            }
        `,
    ],
})
export class SettingsAboutSectionComponent {
    readonly isDesktop = input(false);
    readonly version = input<string | undefined>();
    readonly buildCommit = input<string | undefined>();
    readonly updateMessage = input<string | undefined>();
    readonly appUpdateStatus = input<ElectronBridgeAppUpdateStatus | null>(
        null
    );
    /**
     * The shared settings form; the channel select lives in it so a change
     * goes through the same Save and unsaved-changes flow as every other
     * setting. Absent in hosts that only render the version block.
     */
    readonly form = input<FormGroup | null>(null);

    private readonly translate = inject(TranslateService);

    /** Tech Home TV: follows the application language. */
    readonly lang = signal<TechHomeLang>(readInitialLang());
    readonly t = computed(() => ABOUT_STRINGS[this.lang()]);
    readonly links = signal<ContactLinks>(readCachedLinks());

    constructor() {
        // Parent patches (Discard, backup import) change the form outside
        // this OnPush section's events.
        markSectionForCheckOnFormEvents(this.form);

        this.translate.onLangChange
            .pipe(takeUntilDestroyed())
            .subscribe((event: { lang: string }) =>
                this.lang.set(toTechHomeLang(event.lang))
            );
        void this.refreshLinks();
    }

    readonly updateChannelOptions = input<UpdateChannelOption[]>([]);

    readonly buildCommitShort = computed(() => {
        const commit = this.buildCommit()?.trim();

        return commit ? commit.slice(0, 7) : undefined;
    });

    readonly checkForAppUpdate = output<void>();
    /**
     * Emitted instead of a plain check while the channel select shows a
     * channel the updater has not been told about yet. The host saves the
     * form; the main process re-checks on its own once the saved channel
     * changes, so one click yields the verdict the user is looking at.
     */
    readonly saveAndCheckForAppUpdate = output<void>();
    readonly downloadAppUpdate = output<void>();
    readonly installAppUpdate = output<void>();
    readonly openManualAppUpdate = output<void>();
    readonly openAppUpdateReleaseNotes = output<void>();
    /** The nightly warning offers the backup page before switching. */
    readonly openBackup = output<void>();

    readonly canSelectUpdateChannel = computed(
        () =>
            this.isDesktop() &&
            this.form() !== null &&
            this.updateChannelOptions().length > 0
    );

    /** A nightly build on the stable channel waits for the next stable release. */
    readonly isNightlyBuildOnStableChannel = computed(() => {
        const status = this.appUpdateStatus();

        return (
            status?.installedChannel === 'nightly' &&
            status.channel === 'stable'
        );
    });

    /**
     * The channel the select currently shows. Read off the control on every
     * check rather than tracked as a signal: the section is eagerly checked
     * and the sibling nightly warning already reads the control the same way.
     */
    draftUpdateChannel(): AppUpdateChannel | null {
        const value: unknown = this.form()?.get('updateChannel')?.value;

        return APP_UPDATE_CHANNELS.includes(value as AppUpdateChannel)
            ? (value as AppUpdateChannel)
            : null;
    }

    /**
     * True while the select shows a channel other than the one the last
     * verdict describes. The verdict on screen is then about the OTHER
     * channel, and a plain "check again" would silently repeat it.
     */
    hasPendingChannelChange(): boolean {
        const draft = this.draftUpdateChannel();
        const applied = this.appUpdateStatus()?.channel;

        return draft !== null && applied !== undefined && draft !== applied;
    }

    /**
     * Whether Save would make the updater re-check. A download in flight or
     * finished belongs to the previous channel and is kept, so saving there
     * changes the channel without a new verdict and the plain check stays.
     */
    canSaveAndCheckForAppUpdate(): boolean {
        const status = this.appUpdateStatus()?.status;

        return (
            this.hasPendingChannelChange() &&
            status !== ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloading &&
            status !== ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloaded
        );
    }

    channelLabelKey(channel: AppUpdateChannel | null | undefined): string {
        return channel === 'nightly'
            ? 'SETTINGS.APP_UPDATE_CHANNEL_NIGHTLY'
            : 'SETTINGS.APP_UPDATE_CHANNEL_STABLE';
    }

    /**
     * The channel the verdict on screen belongs to. `verdictChannel` is
     * stamped by every check; a channel change saved while a download was
     * running or done keeps that download, so the two can differ until
     * the new channel is checked.
     */
    verdictChannel(): AppUpdateChannel | null {
        const status = this.appUpdateStatus();

        return status?.verdictChannel ?? status?.channel ?? null;
    }

    /** The kept download was found on another channel than the saved one. */
    hasRetainedOtherChannelVerdict(): boolean {
        const status = this.appUpdateStatus();

        return (
            status?.verdictChannel !== undefined &&
            status.verdictChannel !== status.channel
        );
    }

    readonly appliedChannelLabelKey = computed(() => {
        const channel = this.verdictChannel();

        return channel ? this.channelLabelKey(channel) : null;
    });

    /** The one-word verdict beside the app name in the hero. */
    readonly updateStatusChip = computed<SettingsUpdateStatusChip | null>(
        () => {
            switch (this.appUpdateStatus()?.status) {
                case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available:
                case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloading:
                case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloaded:
                    return {
                        labelKey: 'SETTINGS.UPDATE_AVAILABLE_CHIP',
                        tone: 'accent',
                    };
                case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.NotAvailable:
                    return {
                        labelKey: 'SETTINGS.UPDATE_UP_TO_DATE',
                        tone: 'success',
                    };
                case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Checking:
                    return {
                        labelKey: 'SETTINGS.APP_UPDATE_CHECKING',
                        tone: 'neutral',
                    };
                case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Error:
                    return {
                        labelKey: 'SETTINGS.APP_UPDATE_ERROR',
                        tone: 'warn',
                    };
                default:
                    return null;
            }
        }
    );

    readonly isAppUpdateBusy = computed(() => {
        const status = this.appUpdateStatus()?.status;

        return (
            status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Checking ||
            status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloading
        );
    });

    readonly canDownloadAppUpdate = computed(() => {
        const status = this.appUpdateStatus();

        return (
            status?.supportedSelfUpdate === true &&
            status.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available
        );
    });

    readonly canInstallAppUpdate = computed(() => {
        const status = this.appUpdateStatus();

        return (
            status?.supportedSelfUpdate === true &&
            status.status === ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloaded
        );
    });

    readonly canOpenAppUpdateReleaseNotes = computed(() => {
        const status = this.appUpdateStatus();

        return Boolean(
            status?.currentVersion &&
            status.status !== ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Checking
        );
    });

    readonly canOpenManualAppUpdate = computed(() => {
        const status = this.appUpdateStatus();

        return Boolean(status && !status.supportedSelfUpdate);
    });

    readonly appUpdateStatusLabelKey = computed(() => {
        const status =
            this.appUpdateStatus()?.status ??
            ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Idle;

        switch (status) {
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Checking:
                return 'SETTINGS.APP_UPDATE_CHECKING';
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available:
                return 'SETTINGS.APP_UPDATE_AVAILABLE';
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.NotAvailable:
                return 'SETTINGS.APP_UPDATE_NOT_AVAILABLE';
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloading:
                return 'SETTINGS.APP_UPDATE_DOWNLOADING';
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Downloaded:
                return 'SETTINGS.APP_UPDATE_DOWNLOADED';
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Unsupported:
                return 'SETTINGS.APP_UPDATE_IDLE';
            case ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Error:
                return 'SETTINGS.APP_UPDATE_ERROR';
            default:
                return 'SETTINGS.APP_UPDATE_IDLE';
        }
    });

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
