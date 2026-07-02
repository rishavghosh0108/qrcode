import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class QrPreviewStateService {
  private readonly previewImageUrlSignal = signal<string | null>(null);
  private readonly previewLabelSignal = signal('QR code preview');

  readonly previewImageUrl = computed(() => this.previewImageUrlSignal());
  readonly previewLabel = computed(() => this.previewLabelSignal());
  readonly hasPreview = computed(() => this.previewImageUrlSignal() !== null);

  setPreview(imageUrl: string, label: string): void {
    this.previewImageUrlSignal.set(imageUrl);
    this.previewLabelSignal.set(label);
  }

  clearPreview(): void {
    this.previewImageUrlSignal.set(null);
    this.previewLabelSignal.set('QR code preview');
  }
}