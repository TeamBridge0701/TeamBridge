package com.groupware.dto;

import lombok.Data;

@Data
public class AttendanceDTO {
	private int attendanceId;
	private int employeeId;
	private String workDate;
	private String checkInTime;
	private String checkOutTime;
	private String attendanceStatus;
	
	// 관리자 : 출결 관리, JOIN 해서 쓸 필드
	private String employeeNo;			// 사번 (관리자 출결 관리 화면 표시용)
	private String employeeName;			// 이름
	private String deptName;				// 부서명
	private String positionName;			// 직급명
}
