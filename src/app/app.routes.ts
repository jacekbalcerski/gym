import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/today/today.component').then(m => m.TodayComponent),
  },
  {
    path: 'week',
    loadComponent: () => import('./pages/week/week.component').then(m => m.WeekComponent),
  },
  { path: '**', redirectTo: '' },
];
