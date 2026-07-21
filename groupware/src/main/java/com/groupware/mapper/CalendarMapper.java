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

    // 새 일정 등록
    void insertEvent(CalendarEventDTO dto);
    
    // 일정 수정
    void updateEvent(CalendarEventDTO dto);
    
    // 일정 삭제
    void deleteEvent(int eventId);
}