import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScheduleService } from '../../services/schedule.service';
import { GymSchedule, DayHours } from '../../models/schedule.model';

interface WeekDay {
  date: Date;
  dateLabel: string;
  dayName: string;
  isClosed: boolean;
  hours: DayHours | null;
  reason: string | null;
  isModified: boolean;
}

@Component({
  selector: 'app-week',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto">
      <h1 class="text-2xl font-bold mb-6 text-gray-100">Tygodniowy rozkład</h1>

      @if (loading()) {
        <p class="text-gray-400 text-center py-12">Ładowanie...</p>
      } @else if (error()) {
        <p class="text-red-400 text-center py-12">Błąd pobierania danych</p>
      } @else {
        <div class="space-y-3">
          @for (day of weekDays(); track day.date) {
            <div class="rounded-xl p-4"
                 [class.bg-gray-800]="!day.isClosed"
                 [class.bg-red-950]="day.isClosed"
                 [class.border]="day.isModified"
                 [class.border-yellow-600]="day.isModified">

              <div class="flex justify-between items-start">
                <div>
                  <p class="font-bold text-lg" [class.text-white]="!day.isClosed" [class.text-red-300]="day.isClosed">
                    {{ day.dayName }}
                  </p>
                  <p class="text-sm text-gray-400">{{ day.dateLabel }}</p>
                </div>

                <div class="text-right">
                  @if (day.isClosed) {
                    <span class="text-red-400 font-semibold">Zamknięta</span>
                  } @else if (day.hours) {
                    <span class="text-green-400 font-semibold text-lg">
                      {{ day.hours.open }} – {{ day.hours.close }}
                    </span>
                    @if (day.isModified) {
                      <p class="text-yellow-500 text-xs">zmienione godziny</p>
                    }
                  } @else {
                    <span class="text-gray-500">—</span>
                  }
                </div>
              </div>

              @if (day.reason) {
                <p class="mt-2 text-sm text-gray-400 italic">{{ day.reason }}</p>
              }
            </div>
          }
        </div>

        <!-- Standardowe godziny -->
        @if (schedule()?.regularHours) {
          <div class="rounded-xl bg-gray-800 p-4 mt-6">
            <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Standardowe godziny</h2>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-300">Poniedziałek – Piątek</span>
                <span class="text-white font-medium">
                  {{ schedule()!.regularHours.weekdays.open }} – {{ schedule()!.regularHours.weekdays.close }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-300">Sobota</span>
                <span class="text-white font-medium">
                  {{ schedule()!.regularHours.saturday.open }} – {{ schedule()!.regularHours.saturday.close }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-300">Niedziela</span>
                <span class="text-white font-medium">
                  {{ schedule()!.regularHours.sunday.open }} – {{ schedule()!.regularHours.sunday.close }}
                </span>
              </div>
            </div>
          </div>
        }

        @if (schedule()?.lastChecked) {
          <p class="text-center text-gray-600 text-xs mt-6">
            Dane z: {{ formatDate(schedule()!.lastChecked) }}
          </p>
        }
      }
    </div>
  `,
})
export class WeekComponent implements OnInit {
  private scheduleService = inject(ScheduleService);

  schedule = signal<GymSchedule | null>(null);
  loading = signal(true);
  error = signal(false);

  ngOnInit() {
    this.scheduleService.getSchedule().subscribe({
      next: (data) => {
        this.schedule.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  weekDays = computed<WeekDay[]>(() => {
    const s = this.schedule();
    if (!s) return [];

    const dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    const days: WeekDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const iso = date.toISOString().split('T')[0];

      const closure = s.closures.find(c => iso >= c.dateFrom && iso <= c.dateTo && !c.timeFrom);
      if (closure) {
        days.push({
          date, dateLabel: this.formatShortDate(date),
          dayName: dayNames[date.getDay()],
          isClosed: true, hours: null,
          reason: closure.reason, isModified: false,
        });
        continue;
      }

      const modified = s.modifiedHours.find(m => iso >= m.dateFrom && iso <= m.dateTo);
      if (modified) {
        days.push({
          date, dateLabel: this.formatShortDate(date),
          dayName: dayNames[date.getDay()],
          isClosed: false,
          hours: { open: modified.open, close: modified.close },
          reason: modified.reason, isModified: true,
        });
        continue;
      }

      const dow = date.getDay();
      let hours: DayHours | null = null;
      if (dow === 0) hours = s.regularHours.sunday;
      else if (dow === 6) hours = s.regularHours.saturday;
      else hours = s.regularHours.weekdays;

      days.push({
        date, dateLabel: this.formatShortDate(date),
        dayName: dayNames[date.getDay()],
        isClosed: false, hours, reason: null, isModified: false,
      });
    }

    return days;
  });

  private formatShortDate(date: Date): string {
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('pl-PL', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
  }
}
