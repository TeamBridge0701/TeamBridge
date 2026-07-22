package com.groupware.mapper;

import com.groupware.dto.CalendarEventDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CalendarMapper {
    
    // 특정 연도/월 일정 조회 - 보는 사람(viewerId/viewerDeptId) 기준으로 카테고리별 조회 범위를 다르게 함
    List<CalendarEventDTO> selectEventsByYearAndMonth(@Param("year") int year, @Param("month") int month,
            @Param("viewerId") int viewerId, @Param("viewerDeptId") int viewerDeptId);

    // 수정/삭제 권한 재검증용 단건 조회
    CalendarEventDTO selectEventById(@Param("eventId") int eventId);

    // 출근율 계산(AttendanceService)용 - 그 달의 공휴일(IS_HOLIDAY=1인 COMPANY 일정) 날짜
    // 범위만 조회. 공휴일은 전 직원 공통이라 조회 권한 필터링이 필요 없어서
    // selectEventsByYearAndMonth와 별도로 뺐다(2026-07-22)
    List<CalendarEventDTO> selectHolidayDates(@Param("year") int year, @Param("month") int month);

    // 새 일정 등록
    void insertEvent(CalendarEventDTO dto);
    
    // 일정 수정
    void updateEvent(CalendarEventDTO dto);
    
    // 일정 삭제
    void deleteEvent(int eventId);
}