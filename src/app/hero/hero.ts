import { Component, computed, inject } from '@angular/core';
import { QrPreviewStateService } from '../qr-preview-state.service';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero {
  private readonly qrPreviewState = inject(QrPreviewStateService);

  protected readonly previewImageUrl = this.qrPreviewState.previewImageUrl;
  protected readonly previewLabel = this.qrPreviewState.previewLabel;
  protected readonly hasPreview = this.qrPreviewState.hasPreview;
  protected readonly previewPlaceholder = computed(() =>
    this.hasPreview() ? '' : 'Enter content below and click Generate to see your QR code here',
  );
}
