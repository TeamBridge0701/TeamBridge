package com.groupware.mapper;

import com.groupware.dto.*;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface DashboardMapper {

    // [1] 프로필 및 당일 출결 데이터 조회
    EmployeeDTO selectEmployeeProfile(@Param("employeeId") int employeeId);
    AttendanceDTO selectTodayAttendance(@Param("employeeId") int employeeId, @Param("today") LocalDate today);

    // [2] 최신 공지사항 3건 조회 (상단 고정 우선순위)
    List<NoticeDTO> selectTop3Notices();

    // [3] 전자결재 카운트 및 최근 관련 목록
    int countPendingApprovals(@Param("employeeId") int employeeId);
    int countProgressingApprovals(@Param("employeeId") int employeeId);
    List<ApprovalDTO> selectUserApprovals(@Param("employeeId") int employeeId);

    // [4] 일정 데이터 조회 (CalendarEventDTO 반영)
    List<CalendarEventDTO> selectTodayEvents(@Param("today") LocalDate today);
    List<CalendarEventDTO> selectMiniCalendarEvents();

    // [5] 출퇴근 처리 비동기 액션 쿼리
    void insertCheckIn(@Param("employeeId") int employeeId, 
                       @Param("today") LocalDate today, 
                       @Param("checkInTime") String checkInTime, 
                       @Param("status") String status);
                       
    void updateCheckOut(@Param("employeeId") int employeeId, 
                        @Param("today") LocalDate today, 
                        @Param("checkOutTime") String checkOutTime);

    // [6] 공지사항 상세 및 조회수 증가
    void updateNoticeViews(@Param("noticeId") int noticeId);
    NoticeDTO selectNoticeDetail(@Param("noticeId") int noticeId);
}