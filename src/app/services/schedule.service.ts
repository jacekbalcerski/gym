import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GymSchedule } from '../models/schedule.model';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private http = inject(HttpClient);

  getSchedule(): Observable<GymSchedule> {
    return this.http.get<GymSchedule>('/api/schedule');
  }
}
