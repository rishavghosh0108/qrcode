import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  computed,
  signal,
} from '@angular/core';
import * as QRCode from 'qrcode';
import { QrPreviewStateService } from '../qr-preview-state.service';

type ContentType = 'url' | 'text' | 'email' | 'phone' | 'wifi' | 'upi';
type ErrorLevel = 'L' | 'M' | 'Q' | 'H';
type DownloadFormat = 'png' | 'svg' | 'svg-dl' | 'jpeg';
type StatusTone = 'neutral' | 'success' | 'error';

interface ContentPreset {
  readonly label: string;
  readonly placeholder: string;
}

interface UpiPayload {
  readonly payeeUpiId: string;
  readonly payeeName: string;
  readonly amount: string;
}

interface LegacyQrBridge {
  generateQR?: () => void;
  downloadQR?: (format: DownloadFormat) => void;
}

const CONTENT_PRESETS: Record<ContentType, ContentPreset> = {
  url: {
    label: 'Website URL',
    placeholder: 'https://example.com',
  },
  text: {
    label: 'Plain text',
    placeholder: 'Your message here',
  },
  email: {
    label: 'Email address',
    placeholder: 'hello@example.com',
  },
  phone: {
    label: 'Phone number',
    placeholder: '+1 555 123 4567',
  },
  wifi: {
    label: 'WiFi credentials',
    placeholder: 'SSID:MyNetwork;T:WPA;P:password;;',
  },
  upi: {
    label: 'UPI ID',
    placeholder: 'name@bank',
  },
};

@Component({
  selector: 'app-generator',
  templateUrl: './generator.html',
  styleUrl: './generator.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Generator implements OnDestroy {
  @ViewChild('previewCanvas')
  private previewCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly contentType = signal<ContentType>('url');
  protected readonly inputValue = signal(CONTENT_PRESETS.url.placeholder);
  protected readonly upiPayeeName = signal('');
  protected readonly upiPayeeId = signal('name@bank');
  protected readonly upiAmount = signal('');
  protected readonly foregroundColor = signal('#1e293b');
  protected readonly backgroundColor = signal('#ffffff');
  protected readonly gradientColor = signal('#4f46e5');
  protected readonly size = signal(300);
  protected readonly margin = signal(4);
  protected readonly errorLevel = signal<ErrorLevel>('M');
  protected readonly gradientEnabled = signal(false);
  protected readonly logoEnabled = signal(false);
  protected readonly logoDataUrl = signal<string | null>(null);
  protected readonly logoFileName = signal('No logo selected');
  protected readonly generated = signal(false);
  protected readonly isGenerating = signal(false);
  protected readonly statusMessage = signal('Generate a QR code to see details here.');
  protected readonly statusTone = signal<StatusTone>('neutral');
  protected readonly qrInfo = signal('Generate a QR code to see details here.');

  protected readonly inputLabel = computed(() => CONTENT_PRESETS[this.contentType()].label);
  protected readonly inputPlaceholder = computed(
    () => CONTENT_PRESETS[this.contentType()].placeholder,
  );
  protected readonly foregroundHex = computed(() => this.foregroundColor().toUpperCase());
  protected readonly backgroundHex = computed(() => this.backgroundColor().toUpperCase());
  protected readonly gradientHex = computed(() => this.gradientColor().toUpperCase());
  protected readonly showGradient = computed(() => this.gradientEnabled());
  protected readonly showLogoUpload = computed(() => this.logoEnabled());
  protected readonly showUpiFields = computed(() => this.contentType() === 'upi');
  protected readonly showStatusBar = computed(() => this.statusMessage().length > 0);
  protected readonly showFormError = computed(
    () => this.statusTone() === 'error' && this.statusMessage().length > 0,
  );
  protected readonly statusIcon = computed(() => {
    if (this.statusTone() === 'error') {
      return '!';
    }

    if (this.statusTone() === 'success') {
      return '✓';
    }

    return 'i';
  });
  protected readonly previewAlt = computed(() => {
    const payload = this.buildQrPayload();
    return payload ? `Generated QR code for ${payload}` : 'QR code preview';
  });

  protected readonly effectiveErrorLevel = computed<ErrorLevel>(() => {
    if (!this.logoEnabled()) {
      return this.errorLevel();
    }

    return this.errorLevel() === 'H' ? 'H' : 'H';
  });

  private readonly defaultLogoDataUrl = this.createDefaultLogoDataUrl();

  constructor(private readonly qrPreviewState: QrPreviewStateService) {
    this.registerLegacyBridge();

    effect(() => {
      if (!this.generated()) {
        return;
      }

      const dependencies = [
        this.contentType(),
        this.inputValue(),
        this.upiPayeeName(),
        this.upiPayeeId(),
        this.upiAmount(),
        this.foregroundColor(),
        this.backgroundColor(),
        this.gradientColor(),
        this.size(),
        this.margin(),
        this.errorLevel(),
        this.gradientEnabled(),
        this.logoEnabled(),
        this.logoDataUrl(),
      ];

      void dependencies;
      void this.refreshPreview();
    });
  }

  ngOnDestroy(): void {
    this.clearLegacyBridge();
  }

  protected updateContentType(event: Event): void {
    const value = this.readValue(event) as ContentType;

    if (!(value in CONTENT_PRESETS)) {
      return;
    }

    this.generated.set(false);
    this.clearPreview();
    this.setStatus('');
    this.contentType.set(value);
    this.inputValue.set('');

    if (value === 'upi') {
      this.upiPayeeName.set('');
      this.upiPayeeId.set('');
      this.upiAmount.set('');
      return;
    }

    this.upiPayeeName.set('');
    this.upiPayeeId.set('');
    this.upiAmount.set('');
  }

  protected updateInputValue(event: Event): void {
    this.inputValue.set(this.readValue(event));
  }

  protected updateUpiPayeeName(event: Event): void {
    this.upiPayeeName.set(this.readValue(event));
  }

  protected updateUpiPayeeId(event: Event): void {
    const value = this.readValue(event).trim();
    this.upiPayeeId.set(value);
    this.inputValue.set(value);
  }

  protected updateUpiAmount(event: Event): void {
    this.upiAmount.set(this.readValue(event));
  }

  protected updateForegroundColor(event: Event): void {
    this.foregroundColor.set(this.readValue(event));
  }

  protected updateBackgroundColor(event: Event): void {
    this.backgroundColor.set(this.readValue(event));
  }

  protected updateGradientColor(event: Event): void {
    this.gradientColor.set(this.readValue(event));
  }

  protected updateSize(event: Event): void {
    this.size.set(this.readNumber(event, 150, 600));
  }

  protected updateMargin(event: Event): void {
    this.margin.set(this.readNumber(event, 0, 60));
  }

  protected updateErrorLevel(event: Event): void {
    const value = this.readValue(event) as ErrorLevel;

    if (value === 'L' || value === 'M' || value === 'Q' || value === 'H') {
      this.errorLevel.set(value);
    }
  }

  protected toggleGradient(event: Event): void {
    this.gradientEnabled.set(this.readChecked(event));
  }

  protected toggleLogo(event: Event): void {
    this.logoEnabled.set(this.readChecked(event));
  }

  protected async onLogoSelected(event: Event): Promise<void> {
    const file = this.readFile(event);

    if (!file) {
      this.logoDataUrl.set(null);
      this.logoFileName.set('No logo selected');
      return;
    }

    this.logoFileName.set(file.name);
    this.logoDataUrl.set(await this.fileToDataUrl(file));
  }

  protected async generateQR(): Promise<void> {
    this.isGenerating.set(true);

    try {
      const rendered = await this.refreshPreview(true);

      if (rendered) {
        this.generated.set(true);
        this.qrInfo.set(
          `${this.inputLabel()} • ${this.size()}px • ${this.margin()}px margin • ${this.effectiveErrorLevel()} error correction`,
        );
        this.setStatus('QR code generated successfully.', 'success');
      }
    } catch (error) {
      console.error('Failed to generate QR code', error);
      this.generated.set(false);
      this.clearPreview();
      this.setStatus('Unable to generate the QR code right now.', 'error');
    } finally {
      this.isGenerating.set(false);
    }
  }

  private async refreshPreview(forceGenerate = false): Promise<boolean> {
    const validationMessage = this.getValidationMessage();

    if (validationMessage) {
      this.generated.set(false);

      if (forceGenerate) {
        this.setStatus(validationMessage, 'error');
      }

      this.clearPreview();
      return false;
    }

    const value = this.buildQrPayload();

    const canvas = this.previewCanvas?.nativeElement;

    if (!canvas) {
      if (forceGenerate) {
        this.setStatus('Preview canvas is not ready yet.', 'error');
      }

      return false;
    }

    await this.renderPreview(canvas, value);
    this.publishPreview(canvas);

    if (forceGenerate) {
      this.generated.set(true);
      this.setStatus('QR code generated successfully.', 'success');
    }

    this.qrInfo.set(
      `${this.inputLabel()} • ${this.size()}px • ${this.margin()}px margin • ${this.effectiveErrorLevel()} error correction`,
    );

    return true;
  }

  protected async downloadQR(format: DownloadFormat): Promise<void> {
    const normalizedFormat = format === 'svg-dl' ? 'svg' : format;

    if (!this.generated()) {
      await this.generateQR();
    }

    if (!this.generated()) {
      return;
    }

    try {
      if (normalizedFormat === 'svg') {
        const svg = await this.buildSvgMarkup(this.buildQrPayload());
        this.downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg');
      } else {
        const canvas = this.previewCanvas?.nativeElement;

        if (!canvas) {
          throw new Error('Preview canvas is not available.');
        }

        const mimeType = normalizedFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const extension = normalizedFormat === 'jpeg' ? 'jpg' : 'png';
        const dataUrl = canvas.toDataURL(mimeType, normalizedFormat === 'jpeg' ? 0.92 : undefined);

        this.downloadDataUrl(dataUrl, `qr-code.${extension}`);
      }

      this.setStatus(`${normalizedFormat.toUpperCase()} download ready.`, 'success');
    } catch (error) {
      console.error('Failed to download QR code', error);
      this.setStatus('Unable to prepare the download.', 'error');
    }
  }

  private registerLegacyBridge(): void {
    const legacyWindow = globalThis as typeof globalThis & LegacyQrBridge;
    legacyWindow.generateQR = () => void this.generateQR();
    legacyWindow.downloadQR = (format: DownloadFormat) => void this.downloadQR(format);
  }

  private clearLegacyBridge(): void {
    const legacyWindow = globalThis as typeof globalThis & LegacyQrBridge;
    delete legacyWindow.generateQR;
    delete legacyWindow.downloadQR;
  }

  private readValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  }

  private readNumber(event: Event, min: number, max: number): number {
    const value = Number(this.readValue(event));

    if (Number.isNaN(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, value));
  }

  private readChecked(event: Event): boolean {
    return (event.target as HTMLInputElement | null)?.checked ?? false;
  }

  private readFile(event: Event): File | null {
    return (event.target as HTMLInputElement | null)?.files?.[0] ?? null;
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected file.'));
      reader.readAsDataURL(file);
    });
  }

  private async renderPreview(canvas: HTMLCanvasElement, value: string): Promise<void> {
    const size = this.size();
    const qrCanvas = document.createElement('canvas');
    const tintedCanvas = document.createElement('canvas');

    canvas.width = size;
    canvas.height = size;
    qrCanvas.width = size;
    qrCanvas.height = size;
    tintedCanvas.width = size;
    tintedCanvas.height = size;

    await QRCode.toCanvas(qrCanvas, value, {
      width: size,
      margin: this.margin(),
      errorCorrectionLevel: this.effectiveErrorLevel(),
      color: {
        dark: '#000000',
        light: '#00000000',
      },
    });

    const tintedContext = tintedCanvas.getContext('2d');
    const outputContext = canvas.getContext('2d');

    if (!tintedContext || !outputContext) {
      throw new Error('Unable to access the canvas context.');
    }

    if (this.gradientEnabled()) {
      const gradient = tintedContext.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, this.foregroundColor());
      gradient.addColorStop(1, this.gradientColor());
      tintedContext.fillStyle = gradient;
    } else {
      tintedContext.fillStyle = this.foregroundColor();
    }

    tintedContext.fillRect(0, 0, size, size);
    tintedContext.globalCompositeOperation = 'destination-in';
    tintedContext.drawImage(qrCanvas, 0, 0);
    tintedContext.globalCompositeOperation = 'source-over';

    outputContext.clearRect(0, 0, size, size);
    outputContext.fillStyle = this.backgroundColor();
    outputContext.fillRect(0, 0, size, size);
    outputContext.drawImage(tintedCanvas, 0, 0);

    if (this.logoEnabled()) {
      await this.drawLogo(outputContext, size, this.logoDataUrl() ?? this.defaultLogoDataUrl);
    }
  }

  private async buildSvgMarkup(value: string): Promise<string> {
    return QRCode.toString(value, {
      type: 'svg',
      width: this.size(),
      margin: this.margin(),
      errorCorrectionLevel: this.effectiveErrorLevel(),
      color: {
        dark: this.foregroundColor(),
        light: this.backgroundColor(),
      },
    });
  }

  private async drawLogo(
    context: CanvasRenderingContext2D,
    size: number,
    dataUrl: string,
  ): Promise<void> {
    const image = await this.loadImage(dataUrl);
    const isCustomLogo = dataUrl !== this.defaultLogoDataUrl;
    const logoSize = Math.round(size * (isCustomLogo ? 0.16 : 0.14));
    const padding = Math.round(size * 0.038);
    const x = Math.round((size - logoSize) / 2);
    const y = Math.round((size - logoSize) / 2);

    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = this.backgroundColor();
    context.beginPath();
    this.roundRect(context, x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2, 18);
    context.fill();
    context.drawImage(
      image,
      x,
      y,
      logoSize,
      logoSize,
    );
    context.restore();
  }

  private roundRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const cornerRadius = Math.min(radius, width / 2, height / 2);

    context.moveTo(x + cornerRadius, y);
    context.lineTo(x + width - cornerRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
    context.lineTo(x + width, y + height - cornerRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
    context.lineTo(x + cornerRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
    context.lineTo(x, y + cornerRadius);
    context.quadraticCurveTo(x, y, x + cornerRadius, y);
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to load the logo image.'));
      image.src = source;
    });
  }

  private createDefaultLogoDataUrl(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="QR logo">
        <rect width="96" height="96" rx="24" fill="#ffffff"/>
        <rect x="18" y="18" width="22" height="22" rx="4" fill="#1e293b"/>
        <rect x="56" y="18" width="22" height="22" rx="4" fill="#1e293b"/>
        <rect x="18" y="56" width="22" height="22" rx="4" fill="#1e293b"/>
        <rect x="56" y="56" width="22" height="22" rx="4" fill="#4f46e5"/>
        <rect x="41" y="41" width="14" height="14" rx="3" fill="#1e293b"/>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
  }

  private downloadDataUrl(dataUrl: string, fileName: string): void {
    const anchor = document.createElement('a');

    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.click();
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  private clearPreview(): void {
    const canvas = this.previewCanvas?.nativeElement;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    this.qrPreviewState.clearPreview();
  }

  private publishPreview(canvas: HTMLCanvasElement): void {
    const imageUrl = canvas.toDataURL('image/png');

    this.qrPreviewState.setPreview(imageUrl, this.previewAlt());
  }

  private buildQrPayload(): string {
    if (this.contentType() !== 'upi') {
      return this.inputValue().trim();
    }

    const upiPayload = this.buildUpiPayload();

    if (!upiPayload.payeeUpiId) {
      return '';
    }

    const query = new URLSearchParams();

    query.set('pa', upiPayload.payeeUpiId);
    query.set('cu', 'INR');

    if (upiPayload.payeeName) {
      query.set('pn', upiPayload.payeeName);
    }

    if (upiPayload.amount) {
      query.set('am', upiPayload.amount);
    }

    return `upi://pay?${query.toString()}`;
  }

  private getValidationMessage(): string | null {
    const trimmedValue = this.inputValue().trim();

    switch (this.contentType()) {
      case 'url':
        if (!trimmedValue) {
          return 'Enter a website URL.';
        }

        return this.isValidUrl(trimmedValue) ? null : 'Enter a valid website URL.';
      case 'text':
        return trimmedValue ? null : 'Enter plain text before generating a QR code.';
      case 'email':
        if (!trimmedValue) {
          return 'Enter an email address.';
        }

        return this.isValidEmailAddress(trimmedValue) ? null : 'Enter a valid email address.';
      case 'phone':
        if (!trimmedValue) {
          return 'Enter a phone number.';
        }

        return this.isValidPhoneNumber(trimmedValue) ? null : 'Enter a valid phone number.';
      case 'wifi':
        if (!trimmedValue) {
          return 'Enter WiFi credentials.';
        }

        return this.isValidWifiPayload(trimmedValue)
          ? null
          : 'Enter valid WiFi credentials with an SSID.';
      case 'upi':
        return this.isValidUpiPayload() ? null : 'Enter a valid UPI ID.';
      default:
        return null;
    }
  }

  private isValidUrl(value: string): boolean {
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isValidEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isValidPhoneNumber(value: string): boolean {
    const sanitizedValue = value.replace(/[\s().-]/g, '');
    return /^\+?[0-9]{7,15}$/.test(sanitizedValue);
  }

  private isValidWifiPayload(value: string): boolean {
    return /(?:^|;)SSID:[^;]+/.test(value) || /(?:^|;)S:[^;]+/.test(value);
  }

  private isValidUpiPayload(): boolean {
    const upiPayload = this.buildUpiPayload();

    if (!upiPayload.payeeUpiId || !/^[\w.-]+@[\w.-]+$/.test(upiPayload.payeeUpiId)) {
      return false;
    }

    if (!upiPayload.amount) {
      return true;
    }

    const amountValue = Number(upiPayload.amount);
    return Number.isFinite(amountValue) && amountValue > 0;
  }

  private buildUpiPayload(): UpiPayload {
    return {
      payeeUpiId: this.upiPayeeId().trim(),
      payeeName: this.upiPayeeName().trim(),
      amount: this.upiAmount().trim(),
    };
  }

  private setStatus(message: string, tone: StatusTone = 'neutral'): void {
    this.statusMessage.set(message);
    this.statusTone.set(tone);
  }

}
