import { PrismaService } from './prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth/auth.service';
import { AuthorizationService } from './auth/authorization.service';
import { StorageService } from './storage/storage.service';
import { LedgerService } from './inventory/ledger.service';
import { InventoryService } from './inventory/inventory.service';
import { ReservationsService } from './requests/reservations.service';
import { NotificationsService } from './notifications/notifications.service';
import { ShipmentsService } from './shipments/shipments.service';
import { RequestsService } from './requests/requests.service';
import { ManufacturingService } from './manufacturing/manufacturing.service';
import { DepartmentsService } from './departments/departments.service';
import { ProductsService } from './catalog/products.service';
import { CategoriesService } from './catalog/categories.service';
import { UnitsService } from './catalog/units.service';
import { GeminiExtractionAdapter } from './imports/adapters/gemini-extraction.adapter';
import { ImportsService } from './imports/imports.service';
import { ReportsService } from './reports/reports.service';
import { BackupsService } from './backups/backups.service';
import { UsersService } from './users/users.service';
import { ProjectsService } from './organization/projects.service';
import { WarehousesService } from './organization/warehouses.service';
import { StaffService } from './staff/staff.service';

import { validateEnvironment } from './config/env.validation';

// Global singleton registry for Next.js App Router with lazy service getters for fast cold-starts
class AppContainer {
  private _prisma?: PrismaService;
  private _jwtService?: JwtService;
  private _configService?: ConfigService;
  private _storageService?: StorageService;
  private _notificationsService?: NotificationsService;
  private _authorizationService?: AuthorizationService;
  private _authService?: AuthService;
  private _ledgerService?: LedgerService;
  private _inventoryService?: InventoryService;
  private _reservationsService?: ReservationsService;
  private _shipmentsService?: ShipmentsService;
  private _requestsService?: RequestsService;
  private _manufacturingService?: ManufacturingService;
  private _departmentsService?: DepartmentsService;
  private _productsService?: ProductsService;
  private _categoriesService?: CategoriesService;
  private _unitsService?: UnitsService;
  private _importsService?: ImportsService;
  private _reportsService?: ReportsService;
  private _backupsService?: BackupsService;
  private _usersService?: UsersService;
  private _projectsService?: ProjectsService;
  private _warehousesService?: WarehousesService;
  private _staffService?: StaffService;

  constructor() {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PHASE !== 'phase-production-build'
    ) {
      validateEnvironment(process.env);
    }
  }

  get prisma(): PrismaService {
    return (this._prisma ??= new PrismaService());
  }

  get configService(): ConfigService {
    return (this._configService ??= new ConfigService());
  }

  get jwtService(): JwtService {
    return (this._jwtService ??= new JwtService({
      secret: process.env.JWT_SECRET || 'super_secret_jwt_signing_key_change_in_production',
      signOptions: { expiresIn: '30d' },
    }));
  }

  get storageService(): StorageService {
    return (this._storageService ??= new StorageService(this.configService));
  }

  get notificationsService(): NotificationsService {
    return (this._notificationsService ??= new NotificationsService(this.prisma));
  }

  get authorizationService(): AuthorizationService {
    return (this._authorizationService ??= new AuthorizationService(this.prisma));
  }

  get authService(): AuthService {
    return (this._authService ??= new AuthService(this.prisma, this.jwtService, this.configService));
  }

  get ledgerService(): LedgerService {
    return (this._ledgerService ??= new LedgerService(this.prisma));
  }

  get inventoryService(): InventoryService {
    return (this._inventoryService ??= new InventoryService(this.prisma));
  }

  get reservationsService(): ReservationsService {
    return (this._reservationsService ??= new ReservationsService(this.prisma));
  }

  get shipmentsService(): ShipmentsService {
    return (this._shipmentsService ??= new ShipmentsService(
      this.prisma,
      this.ledgerService,
      this.notificationsService,
    ));
  }

  get requestsService(): RequestsService {
    return (this._requestsService ??= new RequestsService(
      this.prisma,
      this.authorizationService,
      this.ledgerService,
      this.reservationsService,
      this.shipmentsService,
      this.notificationsService,
    ));
  }

  get manufacturingService(): ManufacturingService {
    return (this._manufacturingService ??= new ManufacturingService(
      this.prisma,
      this.ledgerService,
      this.notificationsService,
    ));
  }

  get departmentsService(): DepartmentsService {
    return (this._departmentsService ??= new DepartmentsService(
      this.prisma,
      this.ledgerService,
      this.inventoryService,
      this.notificationsService,
      this.reservationsService,
    ));
  }

  get productsService(): ProductsService {
    return (this._productsService ??= new ProductsService(this.prisma, this.notificationsService));
  }

  get categoriesService(): CategoriesService {
    return (this._categoriesService ??= new CategoriesService(this.prisma));
  }

  get unitsService(): UnitsService {
    return (this._unitsService ??= new UnitsService(this.prisma));
  }

  get importsService(): ImportsService {
    return (this._importsService ??= new ImportsService(
      this.prisma,
      this.ledgerService,
      new GeminiExtractionAdapter(),
      this.storageService,
      this.notificationsService,
    ));
  }

  get reportsService(): ReportsService {
    return (this._reportsService ??= new ReportsService(this.prisma));
  }

  get backupsService(): BackupsService {
    return (this._backupsService ??= new BackupsService(
      this.prisma,
      this.notificationsService,
      this.storageService,
    ));
  }

  get usersService(): UsersService {
    return (this._usersService ??= new UsersService(this.prisma, this.authService));
  }

  get projectsService(): ProjectsService {
    return (this._projectsService ??= new ProjectsService(this.prisma));
  }

  get warehousesService(): WarehousesService {
    return (this._warehousesService ??= new WarehousesService(this.prisma));
  }

  get staffService(): StaffService {
    return (this._staffService ??= new StaffService(this.prisma));
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __appContainer: AppContainer | undefined;
}

export const container = global.__appContainer || (global.__appContainer = new AppContainer());
