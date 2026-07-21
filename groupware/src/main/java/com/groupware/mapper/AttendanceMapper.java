package com.groupware.mapper;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;


import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.AttendanceDTO;

@Mapper
public interface AttendanceMapper {

	// 오늘 근태 기록 조회 (오늘 날짜를 String으로 받음)
	AttendanceDTO selectTodayAttendance(@Param("employeeId") int employeeId, @Param("today") String today);

	// 출근 기록 삽입
	void insertCheckIn(@Param("employeeId") int employeeId, @Param("today") String today,
			@Param("checkInTime") String checkInTime, @Param("status") String status);

	// 퇴근 시간 업데이트 - 수정해야됨
	void updateCheckOut(@Param("employeeId") int employeeId, @Param("today") String today,
			@Param("checkOutTime") String checkOutTime);

	// 이번에 추가할 월별 조회 메서드 선언
	List<AttendanceDTO> selectAttendanceByPeriod(@Param("employeeId") int employeeId,
			@Param("startDate") String startDate, @Param("endDate") String endDate);
    // 관리자 : 출결 관리
    List<AttendanceDTO> selectAttendanceByDate(@Param("data") LocalDate date);
    
    // 관리자 : 특정 직원의 특정 날짜 출결 기록을 등록하거나(없으면) 수정한다(있으면)
    // UNIQUE(EMPLOYEE_ID, WORK_DATE) 제약을 그대로 활용 - insertLeaveRecord와 동일한 방식
    void upsertAttendanceByAdmin(@Param("employeeId") int employeeId, @Param("workDate") String workDate,
    								@Param("checkInTime") String checkInTime, @Param("checkOutTime") String checkOutTime,
    								@Param("status") String status);

	// 전자결재(연차휴가신청서) 최종 승인 시 휴가 기간 하루치를 LEAVE로 반영.
	// 그 날짜에 이미 출결 기록이 있으면 LEAVE로 덮어씀 (2026-07-20 김우주 협의 완료)
	void insertLeaveRecord(@Param("employeeId") int employeeId, @Param("workDate") LocalDate workDate);
}
