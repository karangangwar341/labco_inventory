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

// Global singleton registry for Next.js App Router (persists across hot reloads in development)
class AppContainer {
  public prisma: PrismaService;
  public jwtService: JwtService;
  public configService: ConfigService;
  public storageService: StorageService;
  public notificationsService: NotificationsService;
  public authorizationService: AuthorizationService;
  public authService: AuthService;
  public ledgerService: LedgerService;
  public inventoryService: InventoryService;
  public reservationsService: ReservationsService;
  public shipmentsService: ShipmentsService;
  public requestsService: RequestsService;
  public manufacturingService: ManufacturingService;
  public departmentsService: DepartmentsService;
  public productsService: ProductsService;
  public categoriesService: CategoriesService;
  public unitsService: UnitsService;
  public importsService: ImportsService;
  public reportsService: ReportsService;
  public backupsService: BackupsService;
  public usersService: UsersService;
  public projectsService: ProjectsService;
  public warehousesService: WarehousesService;
  public staffService: StaffService;

  constructor() {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PHASE !== 'phase-production-build'
    ) {
      validateEnvironment(process.env);
    }
    this.prisma = new PrismaService();
    this.configService = new ConfigService();
    this.jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'super_secret_jwt_signing_key_change_in_production',
      signOptions: { expiresIn: '30d' },
    });
    this.storageService = new StorageService(this.configService);
    this.notificationsService = new NotificationsService(this.prisma);
    this.authorizationService = new AuthorizationService(this.prisma);
    this.authService = new AuthService(this.prisma, this.jwtService, this.configService);
    this.ledgerService = new LedgerService(this.prisma);
    this.inventoryService = new InventoryService(this.prisma);
    this.reservationsService = new ReservationsService(this.prisma);
    this.shipmentsService = new ShipmentsService(
      this.prisma,
      this.ledgerService,
      this.notificationsService,
    );
    this.requestsService = new RequestsService(
      this.prisma,
      this.authorizationService,
      this.ledgerService,
      this.reservationsService,
      this.shipmentsService,
      this.notificationsService,
    );
    this.manufacturingService = new ManufacturingService(
      this.prisma,
      this.ledgerService,
      this.notificationsService,
    );
    this.departmentsService = new DepartmentsService(
      this.prisma,
      this.ledgerService,
      this.inventoryService,
      this.notificationsService,
      this.reservationsService,
    );
    this.productsService = new ProductsService(this.prisma, this.notificationsService);
    this.categoriesService = new CategoriesService(this.prisma);
    this.unitsService = new UnitsService(this.prisma);
    const geminiAdapter = new GeminiExtractionAdapter();
    this.importsService = new ImportsService(
      this.prisma,
      this.ledgerService,
      geminiAdapter,
      this.storageService,
      this.notificationsService,
    );
    this.reportsService = new ReportsService(this.prisma);
    this.backupsService = new BackupsService(
      this.prisma,
      this.notificationsService,
      this.storageService,
    );
    this.usersService = new UsersService(this.prisma, this.authService);
    this.projectsService = new ProjectsService(this.prisma);
    this.warehousesService = new WarehousesService(this.prisma);
    this.staffService = new StaffService(this.prisma);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __appContainer: AppContainer | undefined;
}

export const container = global.__appContainer || (global.__appContainer = new AppContainer());
