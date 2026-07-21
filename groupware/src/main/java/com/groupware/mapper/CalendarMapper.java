package com.groupware.mapper;

import com.groupware.dto.CalendarEventDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CalendarMapper {
    
    // 특정 연도/월 일정 조회
    List<CalendarEventDTO> selectEventsByYearAndMonth(@Param("year") int year, @Param("month") int month);
    
    // 새 일정 등록
    void insertEvent(CalendarEventDTO dto);
    
    // 일정 수정
    void updateEvent(CalendarEventDTO dto);
    
    // 일정 삭제
    void deleteEvent(int eventId);
}