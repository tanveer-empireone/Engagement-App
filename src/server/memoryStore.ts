import { DirectionMessage, ShiftReport } from '../types';
import {
  AppConfigState,
  AppStore,
  DEFAULT_CONFIG,
  FOUNDING_ADMIN,
  PendingUpload,
  PersonRecord,
  UploadRecord
} from './store';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryStore implements AppStore {
  private people: PersonRecord[];
  private uploads: UploadRecord[] = [];
  private directions: DirectionMessage[] = [];
  private reports: ShiftReport[] = [];
  private config: AppConfigState;
  private pending = new Map<string, PendingUpload>();

  constructor(seedPeople: PersonRecord[] = [FOUNDING_ADMIN]) {
    this.people = clone(seedPeople);
    this.config = clone(DEFAULT_CONFIG);
  }

  async listPeople() {
    return clone(this.people);
  }

  async findPerson(email: string) {
    const key = email.trim().toLowerCase();
    return clone(this.people.find((person) => person.Email.toLowerCase() === key) || null);
  }

  async insertPerson(person: PersonRecord) {
    const key = person.Email.trim().toLowerCase();
    if (this.people.some((item) => item.Email.toLowerCase() === key)) {
      throw new Error('That email is already on the roster.');
    }
    const saved = { ...person, Email: key };
    this.people.push(saved);
    return clone(saved);
  }

  async updatePerson(email: string, patch: Partial<PersonRecord>) {
    const key = email.trim().toLowerCase();
    const index = this.people.findIndex((person) => person.Email.toLowerCase() === key);
    if (index === -1) return null;
    this.people[index] = { ...this.people[index], ...patch, Email: this.people[index].Email };
    return clone(this.people[index]);
  }

  async listUploadIds() {
    return this.uploads.map((upload) => upload.id);
  }

  async findUpload(id: string) {
    return clone(this.uploads.find((upload) => upload.id === id) || null);
  }

  async listUploads() {
    return clone(this.uploads);
  }

  async insertUpload(upload: UploadRecord) {
    this.uploads.unshift(clone(upload));
  }

  async updateUpload(id: string, patch: Partial<UploadRecord>) {
    const index = this.uploads.findIndex((upload) => upload.id === id);
    if (index === -1) return null;
    this.uploads[index] = { ...this.uploads[index], ...patch, id: this.uploads[index].id };
    return clone(this.uploads[index]);
  }

  async deleteUpload(id: string) {
    const before = this.uploads.length;
    this.uploads = this.uploads.filter((upload) => upload.id !== id);
    return this.uploads.length !== before;
  }

  async deleteAllUploads() {
    const count = this.uploads.length;
    this.uploads = [];
    return count;
  }

  async listDirections() {
    return clone(this.directions);
  }

  async findDirection(id: string) {
    return clone(this.directions.find((item) => item.feedbackId === id) || null);
  }

  async insertDirection(direction: DirectionMessage) {
    this.directions.unshift(clone(direction));
  }

  async updateDirection(id: string, patch: Partial<DirectionMessage>) {
    const index = this.directions.findIndex((item) => item.feedbackId === id);
    if (index === -1) return null;
    this.directions[index] = { ...this.directions[index], ...patch, feedbackId: this.directions[index].feedbackId };
    return clone(this.directions[index]);
  }

  async deleteDirection(id: string) {
    const before = this.directions.length;
    this.directions = this.directions.filter((item) => item.feedbackId !== id);
    return this.directions.length !== before;
  }

  async deleteAllDirections() {
    const count = this.directions.length;
    this.directions = [];
    return count;
  }

  async listReports() {
    return clone(this.reports);
  }

  async findReport(id: string) {
    return clone(this.reports.find((item) => item.reportId === id) || null);
  }

  async insertReport(report: ShiftReport) {
    this.reports.unshift(clone(report));
  }

  async updateReport(id: string, patch: Partial<ShiftReport>) {
    const index = this.reports.findIndex((item) => item.reportId === id);
    if (index === -1) return null;
    this.reports[index] = { ...this.reports[index], ...patch, reportId: this.reports[index].reportId };
    return clone(this.reports[index]);
  }

  async deleteReport(id: string) {
    const before = this.reports.length;
    this.reports = this.reports.filter((item) => item.reportId !== id);
    return this.reports.length !== before;
  }

  async deleteAllReports() {
    const count = this.reports.length;
    this.reports = [];
    return count;
  }

  async getConfig() {
    return clone(this.config);
  }

  async updateConfig(patch: Partial<AppConfigState>) {
    const next = { ...this.config };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    this.config = next;
    return clone(this.config);
  }

  async savePending(pending: PendingUpload) {
    this.pending.set(pending.id, clone(pending));
  }

  async getPending(id: string) {
    return clone(this.pending.get(id) || null);
  }

  async deletePending(id: string) {
    this.pending.delete(id);
  }

  async resetSample() {
    this.people = [clone(FOUNDING_ADMIN)];
    this.uploads = [];
    this.directions = [];
    this.reports = [];
    this.config = clone(DEFAULT_CONFIG);
    this.pending.clear();
  }
}
