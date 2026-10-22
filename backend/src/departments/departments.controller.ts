import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  UserRole,
  DepartmentIssueStatus,
  DepartmentIssueBatchStatus,
  DepartmentReturnStatus,
} from '@prisma/client';
import { DepartmentsService } from './departments.service.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { UpdateDepartmentDto } from './dto/update-department.dto.js';
import {
  ApproveDepartmentDto,
  RejectDepartmentDto,
} from './dto/decide-department.dto.js';
import { CreateDepartmentIssueDto } from './dto/create-department-issue.dto.js';
import { CreateDepartmentReturnDto } from './dto/create-department-return.dto.js';
import {
  ApproveDepartmentActionDto,
  RejectDepartmentActionDto,
} from './dto/decide-department-request.dto.js';
import { SaveDepartmentIssueBatchDto } from './dto/save-department-issue-batch.dto.js';

@ApiTags('Departments, Issues & Returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  // ==========================================
  // DEPARTMENT MASTER ENDPOINTS
  // ==========================================

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Create department (Project Admin proposes PENDING_APPROVAL; Super Admin creates ACTIVE)' })
  async createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.departmentsService.createDepartment(dto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'List departments within caller scope' })
  async getDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.departmentsService.getDepartments(projectId, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Update or propose updates to a department' })
  async updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.updateDepartment(id, dto, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin approves proposed department creation or change' })
  async approveDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveDepartmentDto,
  ) {
    return this.departmentsService.approveDepartment(id, dto, user);
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin rejects proposed department creation or change' })
  async rejectDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDepartmentDto,
  ) {
    return this.departmentsService.rejectDepartment(id, dto, user);
  }

  // ==========================================
  // DEPARTMENT ISSUES ENDPOINTS
  // ==========================================

  @Post('issues/draft')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Get or create the project daily department issue draft' })
  async getOpenIssueBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.departmentsService.getOpenIssueBatch(user, projectId);
  }

  @Get('issues/batches')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'List department issue batches within caller scope' })
  async getIssueBatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: DepartmentIssueBatchStatus,
  ) {
    return this.departmentsService.getIssueBatches(status, user);
  }

  @Patch('issues/batches/:id/lines')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Replace line items in an editable daily department issue draft' })
  async saveIssueBatchLines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveDepartmentIssueBatchDto,
  ) {
    return this.departmentsService.saveIssueBatchLines(id, dto, user);
  }

  @Post('issues/batches/:id/submit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Submit the daily department issue batch for posting or approval' })
  async submitIssueBatch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.departmentsService.submitIssueBatch(id, user);
  }

  @Post('issues/batches/:id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Approve and post every line in a department issue batch atomically' })
  async approveIssueBatch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.departmentsService.decideIssueBatch(id, true, undefined, user);
  }

  @Post('issues/batches/:id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject every line in a department issue batch' })
  async rejectIssueBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDepartmentActionDto,
  ) {
    return this.departmentsService.decideIssueBatch(id, false, dto.reason, user);
  }

  @Post('issues')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Submit department issue request (pending approval)' })
  async createIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentIssueDto,
  ) {
    return this.departmentsService.createIssue(dto, user);
  }

  @Get('issues')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'List department issues within caller scope' })
  async getIssues(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: DepartmentIssueStatus,
  ) {
    return this.departmentsService.getIssues({ projectId, departmentId, status }, user);
  }

  @Get('issues/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Get department issue details by ID' })
  async getIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.departmentsService.getIssue(id, user);
  }

  @Post('issues/:id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Super Admin approves issue, deducts project usable stock atomically' })
  async approveIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveDepartmentActionDto,
    @Headers('Idempotency-Key') headerIdempotencyKey?: string,
  ) {
    const finalDto = {
      ...dto,
      idempotencyKey: headerIdempotencyKey || dto.idempotencyKey,
    };
    return this.departmentsService.approveIssue(id, finalDto, user);
  }

  @Post('issues/:id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin rejects department issue' })
  async rejectIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDepartmentActionDto,
  ) {
    return this.departmentsService.rejectIssue(id, dto, user);
  }

  // ==========================================
  // DEPARTMENT RETURNS ENDPOINTS
  // ==========================================

  @Post('returns')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Submit a department return request (pending approval)' })
  async createReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentReturnDto,
  ) {
    return this.departmentsService.createReturn(dto, user);
  }

  @Get('returns')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'List department returns within caller scope' })
  async getReturns(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: DepartmentReturnStatus,
  ) {
    return this.departmentsService.getReturns(
      { projectId, departmentId, status },
      user,
    );
  }

  @Get('returns/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Get department return details by ID' })
  async getReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.departmentsService.getReturn(id, user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)
  @ApiOperation({ summary: 'Get department details by ID' })
  async getDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.departmentsService.getDepartment(id, user);
  }

  @Post('returns/:id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Super Admin approves return and credits usable project stock' })
  async approveReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveDepartmentActionDto,
    @Headers('Idempotency-Key') headerIdempotencyKey?: string,
  ) {
    const finalDto = {
      ...dto,
      idempotencyKey: headerIdempotencyKey || dto.idempotencyKey,
    };
    return this.departmentsService.approveReturn(id, finalDto, user);
  }

  @Post('returns/:id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin rejects department return' })
  async rejectReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDepartmentActionDto,
  ) {
    return this.departmentsService.rejectReturn(id, dto, user);
  }

}
