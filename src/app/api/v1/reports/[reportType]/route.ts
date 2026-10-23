import { NextResponse } from 'next/server';
import { container } from '@/server/container';
import { authenticateUser, handleApiError } from '@/server/auth/auth-guard';
import { ReportType, ReportFormat, QueryReportDto } from '@/server/reports/dto/query-report.dto';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportType: string }> },
) {
  try {
    const user = await authenticateUser(req);
    const { reportType } = await params;
    const { searchParams } = new URL(req.url);

    const query: QueryReportDto = {
      format: (searchParams.get('format') as ReportFormat) || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      locationId: searchParams.get('locationId') || undefined,
      productId: searchParams.get('productId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      warehouseId: searchParams.get('warehouseId') || undefined,
    };

    const result = await container.reportsService.generateReport(
      reportType as ReportType,
      query,
      user,
    );

    if (result.format === 'csv') {
      return new NextResponse(result.csvData, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.filename || 'report.csv'}"`,
        },
      });
    }

    if (result.format === 'xlsx' && result.buffer) {
      return new NextResponse(new Uint8Array(result.buffer), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${result.filename || 'report.xlsx'}"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
