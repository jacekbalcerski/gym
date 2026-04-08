import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScheduleService } from '../../services/schedule.service';
import { GymSchedule, DayHours } from '../../models/schedule.model';

interface DayStatus {
  date: Date;
  label: string;
  isOpen: boolean;
  isClosed: boolean;
  hours: DayHours | null;
  closureReason: string | null;
}

@Component({
  selector: 'app-today',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto">

      <!-- Baner: strona OSiR niedostępna -->
      @if (schedule()?.siteUnavailable) {
        <div class="rounded-xl bg-orange-900 border border-orange-700 p-3 mb-4 flex items-center gap-3">
          <span class="text-xl">⚠️</span>
          <p class="text-orange-200 text-sm">
            Strona OSiR jest niedostępna — wyświetlane dane mogą być nieaktualne.
          </p>
        </div>
      }

      <!-- Status teraz -->
      <div class="rounded-2xl p-6 mb-6 text-center"
           [class.bg-green-900]="isOpenNow()"
           [class.bg-red-900]="!isOpenNow() && schedule() !== null"
           [class.bg-gray-800]="schedule() === null">

        @if (loading()) {
          <p class="text-2xl font-bold text-gray-400">Ładowanie...</p>
        } @else if (error()) {
          <p class="text-xl font-bold text-red-400">Błąd pobierania danych</p>
        } @else if (schedule()) {
          <div [class.text-green-300]="isOpenNow()" [class.text-red-300]="!isOpenNow()">
            <p class="text-5xl font-black tracking-wide mb-2">
              {{ isOpenNow() ? 'OTWARTA' : 'ZAMKNIĘTA' }}
            </p>
            <p class="text-lg font-medium">
              {{ statusSubtitle() }}
            </p>
          </div>
        }
      </div>

      <!-- Dzisiaj -->
      @if (todayStatus()) {
        <div class="rounded-xl bg-gray-800 p-4 mb-4">
          <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Dzisiaj</h2>
          @if (todayStatus()!.isClosed) {
            <p class="text-red-400 font-semibold">Zamknięta cały dzień</p>
            @if (todayStatus()!.closureReason) {
              <p class="text-gray-400 text-sm mt-1">{{ todayStatus()!.closureReason }}</p>
            }
          } @else if (todayStatus()!.hours) {
            <p class="text-xl font-bold">
              {{ todayStatus()!.hours!.open }} – {{ todayStatus()!.hours!.close }}
            </p>
          } @else {
            <p class="text-gray-400">Brak danych o godzinach</p>
          }
        </div>
      }

      <!-- Najbliższe 7 dni -->
      @if (weekStatuses().length > 0) {
        <div class="rounded-xl bg-gray-800 p-4 mb-4">
          <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Najbliższe 7 dni</h2>
          <div class="space-y-2">
            @for (day of weekStatuses(); track day.date) {
              <div class="flex justify-between items-center py-2 border-b border-gray-700 last:border-0">
                <span class="text-gray-300 font-medium">{{ day.label }}</span>
                @if (day.isClosed) {
                  <span class="text-red-400 text-sm font-semibold">Zamknięta</span>
                } @else if (day.hours) {
                  <span class="text-green-400 text-sm">{{ day.hours.open }} – {{ day.hours.close }}</span>
                } @else {
                  <span class="text-gray-500 text-sm">—</span>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Uwagi / ostrzeżenia -->
      @if (showWarning()) {
        <div class="rounded-xl bg-yellow-900 border border-yellow-700 p-4 mb-4">
          <h2 class="text-sm font-semibold text-yellow-300 uppercase tracking-wider mb-2">Uwagi</h2>
          @if (schedule()?.parseConfidence !== 'high') {
            <p class="text-yellow-200 text-sm mb-2">
              Pewność analizy: <strong>{{ schedule()?.parseConfidence }}</strong> — dane mogą być niedokładne.
            </p>
          }
          @for (notice of schedule()?.notices ?? []; track notice) {
            <p class="text-yellow-100 text-sm">{{ notice }}</p>
          }
        </div>
      }

      <!-- Ostatnie sprawdzenie -->
      @if (schedule()?.lastChecked) {
        <div class="text-center mt-6">
          <p class="text-xs" [class]="dataFreshnessClass()">
            Dane z: {{ formatDate(schedule()!.lastChecked) }}
          </p>
          @if (dataAgeHours() > 24) {
            <p class="text-xs text-orange-400 mt-1">
              Dane mają {{ dataAgeHours() }}h — mogą być nieaktualne
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class TodayComponent implements OnInit {
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

  todayStatus = computed<DayStatus | null>(() => {
    const s = this.schedule();
    if (!s) return null;
    return this.getDayStatus(s, new Date());
  });

  weekStatuses = computed<DayStatus[]>(() => {
    const s = this.schedule();
    if (!s) return [];
    const days: DayStatus[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push(this.getDayStatus(s, d));
    }
    return days;
  });

  isOpenNow = computed<boolean>(() => {
    const s = this.schedule();
    if (!s) return false;
    const today = this.getDayStatus(s, new Date());
    if (today.isClosed || !today.hours) return false;
    const now = new Date();
    const [openH, openM] = today.hours.open.split(':').map(Number);
    const [closeH, closeM] = today.hours.close.split(':').map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;
    return nowMin >= openMin && nowMin < closeMin;
  });

  statusSubtitle = computed<string>(() => {
    const s = this.schedule();
    if (!s) return '';
    const today = this.getDayStatus(s, new Date());
    if (today.isClosed) return today.closureReason ?? 'Nieczynna dzisiaj';
    if (!today.hours) return 'Brak danych o godzinach';
    if (this.isOpenNow()) return `Zamknięcie o ${today.hours.close}`;
    const now = new Date();
    const [openH, openM] = today.hours.open.split(':').map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const openMin = openH * 60 + openM;
    if (nowMin < openMin) return `Otwarcie o ${today.hours.open}`;
    return `Zamknięta — otwarcie jutro o ${this.getTomorrowOpen(s)}`;
  });

  showWarning = computed<boolean>(() => {
    const s = this.schedule();
    if (!s) return false;
    return s.parseConfidence !== 'high' || (s.notices?.length ?? 0) > 0;
  });

  dataAgeHours = computed<number>(() => {
    const s = this.schedule();
    if (!s?.lastChecked) return 0;
    return Math.floor((Date.now() - new Date(s.lastChecked).getTime()) / 3_600_000);
  });

  dataFreshnessClass = computed<string>(() => {
    const h = this.dataAgeHours();
    if (h < 24) return 'text-green-700';
    if (h < 48) return 'text-orange-500';
    return 'text-red-500';
  });

  private getDayStatus(schedule: GymSchedule, date: Date): DayStatus {
    const iso = this.toISODate(date);
    const dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    const label = dayNames[date.getDay()];

    const closure = schedule.closures?.find(c => iso >= c.dateFrom && iso <= c.dateTo && !c.timeFrom);
    if (closure) {
      return { date, label, isOpen: false, isClosed: true, hours: null, closureReason: closure.reason };
    }

    const modified = schedule.modifiedHours?.find(m => iso >= m.dateFrom && iso <= m.dateTo);
    if (modified) {
      return { date, label, isOpen: true, isClosed: false, hours: { open: modified.open, close: modified.close }, closureReason: null };
    }

    const dow = date.getDay();
    let hours: DayHours | null = null;
    if (schedule.regularHours) {
      if (dow === 0) hours = schedule.regularHours.sunday;
      else if (dow === 6) hours = schedule.regularHours.saturday;
      else hours = schedule.regularHours.weekdays;
    }

    return { date, label, isOpen: true, isClosed: false, hours, closureReason: null };
  }

  private getTomorrowOpen(schedule: GymSchedule): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const status = this.getDayStatus(schedule, tomorrow);
    return status.hours?.open ?? '—';
  }

  private toISODate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('pl-PL', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
  }
}
