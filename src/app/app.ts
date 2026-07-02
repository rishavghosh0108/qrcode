import { Component, signal } from '@angular/core';
import { Header } from "./header/header";
import { Footer } from "./footer/footer";
import { Pricing } from "./pricing/pricing";
import { Features } from "./features/features";
import { Hero } from "./hero/hero";
import { Generator } from './generator/generator';

@Component({
  selector: 'app-root',
  imports: [Header, Footer, Pricing, Features, Hero, Generator],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Qr');
}
