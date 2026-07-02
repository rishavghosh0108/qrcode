import { Component, inject, OnInit, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header implements OnInit {
  private readonly document = inject(DOCUMENT);
  readonly isDark = signal(false);

  ngOnInit(): void {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
    const darkMode = storedTheme ? storedTheme === 'dark' : prefersDark;

    this.applyTheme(darkMode);
  }

  updateTheme(): void {
    this.applyTheme(!this.isDark());
  }

  private applyTheme(isDark: boolean): void {
    this.isDark.set(isDark);
    this.document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }
}
