import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-gray-950">
      <!-- Nawigacja -->
      <nav class="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div class="max-w-md mx-auto flex">
          <a routerLink="/" routerLinkActive="border-b-2 border-green-500 text-white"
             [routerLinkActiveOptions]="{exact: true}"
             class="flex-1 py-4 text-center text-sm font-semibold text-gray-400 hover:text-white transition-colors">
            Dzisiaj
          </a>
          <a routerLink="/week" routerLinkActive="border-b-2 border-green-500 text-white"
             class="flex-1 py-4 text-center text-sm font-semibold text-gray-400 hover:text-white transition-colors">
            Tydzień
          </a>
        </div>
      </nav>

      <router-outlet />
    </div>
  `,
})
export class App {}
