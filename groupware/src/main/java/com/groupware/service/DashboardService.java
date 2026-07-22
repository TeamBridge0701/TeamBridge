package com.groupware.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.groupware.dto.ApprovalDTO;
import com.groupware.dto.ApprovalPageDTO;
import com.groupware.dto.AttendanceDTO;
import com.groupware.dto.CalendarEventDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.NoticeDTO;
import com.groupware.mapper.DashboardMapper;
import com.groupware.mapper.EmployeeMapper;

@Service
public class DashboardService {

    // 대시보드 표에 "미리보기로" 몇 건까지만 보여줄지(전체 개수가 아니라 화면에 그리는 줄 수 제한).
    // 공지 목록/결재함 각각의 실제 목록 페이지 크기와는 다른, 대시보드 전용 값이라 여기 따로 둠
    private static final int DASHBOARD_NOTICE_COUNT = 3;
    private static final int DASHBOARD_APPROVAL_COUNT = 3;

    private final DashboardMapper dashboardMapper;
    private final NoticeService noticeService;
    // 전자결재 위젯도 새 SQL 없이 ApprovalService의 기존 조회(받은/보낸 결재함)를
    // 그대로 재사용한다 (공지 위젯과 같은 방식)
    private final ApprovalService approvalService;
    // 오늘 일정 위젯도 새 SQL 없이 캘린더 페이지가 쓰는 조회를 그대로 재사용한다.
    // 이 조회는 개인/팀/회사 권한 필터링(CalendarService.getEventsByYearAndMonth)까지
    // 이미 포함돼 있어서, 대시보드에서 따로 권한을 다시 신경 쓸 필요가 없다는 장점이 있음
    private final CalendarService calendarService;
    // 월간 근태 요약도 출결 현황 페이지(AttendanceService.getMonthlyAttendance)를 그대로 재사용
    private final AttendanceService attendanceService;
    // 이번 달 생일자 조회 - 새 서비스를 만들지 않고 조직도(EmployeeMapper)가 쓰는
    // 매퍼에 조회 메서드만 하나 추가해서 재사용한다(다른 위젯들과 같은 재사용 원칙)
    private final EmployeeMapper employeeMapper;

    public DashboardService(DashboardMapper dashboardMapper, NoticeService noticeService,
            ApprovalService approvalService, CalendarService calendarService,
            AttendanceService attendanceService, EmployeeMapper employeeMapper) {
        this.dashboardMapper = dashboardMapper;
        this.noticeService = noticeService;
        this.approvalService = approvalService;
        this.calendarService = calendarService;
        this.attendanceService = attendanceService;
        this.employeeMapper = employeeMapper;
    }

    // 대시보드 화면에 필요한 데이터 모음. employeeId만으로는 부서(deptId) 등을 알 수 없어서
    // 캘린더 조회(팀 일정 권한 판단에 deptId 필요)까지 재사용하려면 EmployeeDTO 전체가 필요함
    @Transactional(readOnly = true)
    public Map<String, Object> getMainDashboardData(EmployeeDTO employee) {
        int employeeId = employee.getEmployeeId();
        Map<String, Object> resultMap = new HashMap<>();

        resultMap.put("employee", null);
        resultMap.put("attendance", null);
        // 공지 목록 1페이지(고정글 우선 + 최신순, 최대 10건)를 그대로 재사용해서
        // 앞의 3건만 잘라 씀 - 대시보드 전용 쿼리를 새로 만들 필요가 없음
        List<NoticeDTO> latestNotices = noticeService.getNoticeList(null, 1);
        // subList(0, N) = 리스트 맨 앞부터 N개만 잘라낸 부분 리스트. 실제 건수(latestNotices.size())가
        // N보다 적을 수도 있으니 Math.min으로 "더 작은 쪽"을 잘라내는 기준으로 삼아
        // ArrayIndexOutOfBounds(범위 초과 에러)가 안 나게 방어함
        resultMap.put("notices", latestNotices.subList(0, Math.min(DASHBOARD_NOTICE_COUNT, latestNotices.size())));

        // 받은 결재함 = 지금 내가 승인해야 할 차례인 문서들. "결재 대기 문서" 숫자(전체 건수)와
        // 표 미리보기(앞 3건만)를 이 하나의 조회 결과에서 같이 만들어 쓴다.
        // (2026-07-22 정진국 담당 전자결재에 페이지네이션이 추가되며 getInbox/getOutbox가
        // 페이지 단위 결과(ApprovalPageDTO)를 반환하도록 바뀜 - 대시보드는 "전체 건수"가
        // 필요해서 content(최대 10건)가 아니라 totalCount를 써야 함. 미리보기 3건은 어차피
        // PAGE_SIZE(10)보다 작아서 1페이지 content만으로 충분함)
        ApprovalPageDTO inboxPage = approvalService.getInbox(employeeId, 1);
        List<ApprovalDTO> inbox = inboxPage.getContent();
        resultMap.put("waitCount", inboxPage.getTotalCount()); // 표에는 3건만 보여도, 숫자는 "전체" 건수
        resultMap.put("approvals", inbox.subList(0, Math.min(DASHBOARD_APPROVAL_COUNT, inbox.size())));

        // 보낸 기안함 중 아직 승인도 반려도 안 되고 "진행중(PROGRESS)"인 것만 센 건수.
        // 페이지네이션 때문에 getOutbox로는 1페이지(최대 10건)만 볼 수 있어 전체 집계가
        // 안 되므로, 전용 카운트 쿼리(getOutboxProgressCount)를 따로 쓴다.
        int progressCount = approvalService.getOutboxProgressCount(employeeId);
        resultMap.put("progressCount", progressCount);

        // 오늘 일정 = 이번 달 전체 일정(캘린더 페이지와 완전히 동일한 조회, 권한 필터링 포함)을
        // 가져온 뒤, 그중 오늘 날짜가 시작일~종료일 사이에 포함되는 것만 추림
        LocalDate today = LocalDate.now();
        String todayStr = today.toString(); // LocalDate.toString()은 "YYYY-MM-DD" 형식이라 DB 문자열과 그대로 비교 가능
        List<CalendarEventDTO> monthEvents = calendarService.getEventsByYearAndMonth(
                today.getYear(), today.getMonthValue(), employee);
        List<CalendarEventDTO> todayEvents = monthEvents.stream()
                .filter(e -> e.getStartDate().compareTo(todayStr) <= 0 && e.getEndDate().compareTo(todayStr) >= 0)
                .collect(Collectors.toList());
        resultMap.put("todayEvents", todayEvents);

        // 미니 캘린더 - 오늘 일정 위젯에서 이미 조회한 이번 달 전체 일정(monthEvents)을 그대로
        // 재사용해서, 42칸(또는 35칸) 각각에 그 날 일정이 있는지만 계산해서 넘겨준다.
        // Thymeleaf에서 요일 맞춰 칸을 만드는 계산을 하기가 번거로워서, 자바 쪽에서 미리
        // "그릴 준비가 끝난" 리스트로 만들어 화면은 th:each로 뿌리기만 하면 되게 함
        resultMap.put("miniCalendarDays", buildMiniCalendarDays(today, monthEvents));
        resultMap.put("currentYear", today.getYear());
        resultMap.put("currentMonth", today.getMonthValue());

        // 월간 근태 요약(출근일수/지각/연차/출근율) - AttendanceService.getAttendanceSummary()로
        // 계산을 통째로 옮김. AttendanceController(실시간 갱신)도 같은 메서드를 쓰므로
        // 여기서 다시 계산하지 않고 그 결과만 그대로 꺼내 쓴다(2026-07-22 정리)
        resultMap.putAll(attendanceService.getAttendanceSummary(employeeId, today.getYear(), today.getMonthValue()));

        // 이번 달 생일자 - 생년월일을 아직 입력 안 한 직원은 EmployeeMapper.findBirthdaysInMonth
        // SQL 조건(BIRTH_DATE IS NOT NULL)에서 자연히 빠진다
        resultMap.put("birthdayEmployees", employeeMapper.findBirthdaysInMonth(today.getMonthValue()));

        return resultMap;
    }

    // 미니 캘린더 그리드용 날짜 칸 목록 계산 - calendar.js의 buildCalendarWeeks()와 같은
    // 원리(요일 맞추려고 앞뒤로 이전/다음 달 날짜 포함)를 자바에서 그대로 재현한 것
    private List<Map<String, Object>> buildMiniCalendarDays(LocalDate today, List<CalendarEventDTO> monthEvents) {
        LocalDate first = today.withDayOfMonth(1);
        // DayOfWeek.getValue()는 월=1 ~ 일=7이라, 일요일을 0으로 만들려고 7로 나눈 나머지를 씀
        int startDay = first.getDayOfWeek().getValue() % 7;
        LocalDate gridStart = first.minusDays(startDay);
        int totalCells = (int) (Math.ceil((startDay + today.lengthOfMonth()) / 7.0) * 7);

        List<Map<String, Object>> days = new ArrayList<>();
        for (int i = 0; i < totalCells; i++) {
            LocalDate cellDate = gridStart.plusDays(i);
            String cellDateStr = cellDate.toString();

            // 그 날짜에 걸쳐있는 일정 제목들을 모아서, 클릭했을 때 토스트로 보여줄 문구를 미리 만들어둠
            List<String> titlesOnThisDay = monthEvents.stream()
                    .filter(e -> e.getStartDate().compareTo(cellDateStr) <= 0 && e.getEndDate().compareTo(cellDateStr) >= 0)
                    .map(CalendarEventDTO::getEventTitle)
                    .collect(Collectors.toList());

            Map<String, Object> day = new HashMap<>();
            day.put("day", cellDate.getDayOfMonth());
            day.put("otherMonth", cellDate.getMonthValue() != today.getMonthValue());
            day.put("isToday", cellDate.isEqual(today));
            day.put("hasEvent", !titlesOnThisDay.isEmpty());
            day.put("eventSummary", String.join(", ", titlesOnThisDay));
            days.add(day);
        }
        return days;
    }
}